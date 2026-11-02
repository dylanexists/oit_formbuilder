const formPage = document.querySelector("[data-form-id]");
const editorViewForResponses = document.querySelector("#editor-view");
const previewViewForResponses = document.querySelector("#preview-view");
const submissionView = document.querySelector("#submission-view");
const submitResponseButton = document.querySelector("[data-submit-response]");
const retakeFormButton = document.querySelector("[data-retake-form]");
const submittedAnswersList = document.querySelector("[data-submitted-answers]");

if (
  formPage && editorViewForResponses && previewViewForResponses && submissionView &&
  submitResponseButton && retakeFormButton && submittedAnswersList
) {
  const viewModeToggleForResponses = document.querySelector("[data-view-mode-toggle]");
  const submitGuidance = document.querySelector("[data-submit-guidance]");
  const storageKey = `formforge:state:${formPage.dataset.formId}`;
  let state = loadState();
  if (state.formSnapshot) {
    restoreFormSnapshot(state.formSnapshot);
  }
  let currentDefinition = getFormDefinition();

  restoreDraft();
  updateSubmitButton();
  if (state.submission) {
    showSubmission();
  } else {
    restoreViewMode(state.mode);
  }

  document.addEventListener("input", (event) => {
    if (isFormDefinitionField(event.target)) {
      refreshDefinition();
      return;
    }
    if (previewViewForResponses.contains(event.target)) {
      saveDraft();
    }
  });

  document.addEventListener("change", (event) => {
    if (isFormDefinitionField(event.target)) {
      refreshDefinition();
      return;
    }
    if (previewViewForResponses.contains(event.target)) {
      saveDraft();
    }
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest("[data-add-question], [data-add-answer], [data-delete-question], [data-delete-answer], [data-question-type-toggle]")) {
      refreshDefinition();
      return;
    }
    if (event.target.closest("[data-save-question]")) {
      persistState();
      return;
    }
    if (event.target.closest("[data-view-mode-toggle]")) {
      persistState();
    }
  });

  submitResponseButton.addEventListener("click", () => {
    const responses = collectResponses();
    if (responses.length === 0 || responses.some((response) => !response.isAnswered)) {
      updateSubmitButton();
      return;
    }

    state.submission = {
      submittedAt: new Date().toISOString(),
      answers: responses.map(({ isAnswered, ...response }) => response),
    };
    state.draft = {};
    persistState();
    showSubmission();
  });

  retakeFormButton.addEventListener("click", () => {
    state.submission = null;
    state.draft = {};
    state.mode = "preview";
    clearPreviewAnswers();
    submissionView.hidden = true;
    editorViewForResponses.hidden = true;
    previewViewForResponses.hidden = false;
    if (viewModeToggleForResponses) {
      viewModeToggleForResponses.hidden = false;
      viewModeToggleForResponses.setAttribute("aria-pressed", "true");
      viewModeToggleForResponses.textContent = "Switch to Editor View";
    }
    updateSubmitButton();
    persistState();
  });

  function isFormDefinitionField(target) {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? editorViewForResponses.contains(target) && (
        target.hasAttribute("data-question-edit-field") ||
        target.id === "edit-form-title" || target.id === "edit-form-description"
      )
      : false;
  }

  function getFormDefinition() {
    const questionEditors = Array.from(editorViewForResponses.querySelectorAll("[data-question-editor]"));
    return JSON.stringify({
      id: formPage.dataset.formId,
      title: document.querySelector("#edit-form-title")?.value ?? "",
      description: document.querySelector("#edit-form-description")?.value ?? "",
      questions: questionEditors.map((question) => ({
        id: question.dataset.questionId,
        text: Array.from(question.querySelectorAll("input[data-question-edit-field]"))
          .find((field) => field.type === "text" && !field.hasAttribute("data-question-option"))?.value ?? "",
        type: question.querySelector("[data-question-type]")?.value ?? "",
        answer: question.querySelector("[data-correct-answer]:checked")?.value ?? "",
        options: Array.from(question.querySelectorAll("[data-question-option]"), (option) => option.value),
      })),
    });
  }

  function captureFormSnapshot() {
    const editorQuestions = Array.from(editorViewForResponses.querySelectorAll("[data-question-editor]"));
    const previewQuestions = Array.from(previewViewForResponses.querySelectorAll("[data-preview-question]"));

    return {
      title: document.querySelector("#edit-form-title")?.value ?? "",
      description: document.querySelector("#edit-form-description")?.value ?? "",
      questions: editorQuestions.map((question) => {
        const textField = Array.from(question.querySelectorAll("input[data-question-edit-field]"))
          .find((field) => field.type === "text" && !field.hasAttribute("data-question-option"));
        const correctRadios = Array.from(question.querySelectorAll("[data-correct-answer]"));
        return {
          id: question.dataset.questionId,
          text: textField?.value ?? "",
          textDefault: textField?.defaultValue ?? "",
          type: question.querySelector("[data-question-type]")?.value ?? "multiple_choice",
          savedType: question.dataset.savedType ?? "",
          savedAnswer: question.dataset.savedAnswer ?? "",
          savedOptionCount: Number(question.dataset.savedOptionCount ?? 0),
          selectedCorrectIndex: correctRadios.findIndex((radio) => radio.checked),
          options: Array.from(question.querySelectorAll("[data-question-option]"), (option) => ({
            value: option.value,
            defaultValue: option.defaultValue,
          })),
          required: previewQuestions.find((preview) => preview.dataset.questionId === question.dataset.questionId)
            ?.dataset.required === "true",
        };
      }),
      previewQuestions: previewQuestions.map((question) => {
        const shortSection = question.querySelector('[data-preview-question-type="short_text"]');
        const heading = question.querySelector("h2");
        return {
          id: question.dataset.questionId,
          text: heading?.textContent ?? "",
          type: shortSection && !shortSection.hidden ? "short_text" : "multiple_choice",
          required: question.dataset.required === "true",
          answer: question.dataset.correctAnswer ?? "",
          hidden: question.hidden,
          options: Array.from(question.querySelectorAll('[data-preview-options] input[type="radio"]'), (radio) => radio.value),
        };
      }),
    };
  }

  function restoreFormSnapshot(snapshot) {
    const editorList = document.querySelector("#editor-questions");
    const previewList = document.querySelector("#preview-questions");
    const editorTemplate = document.querySelector("#editor-question-template");
    const previewTemplate = document.querySelector("#preview-question-template");
    if (!editorList || !previewList || !editorTemplate || !previewTemplate) {
      return;
    }

    const titleInput = document.querySelector("#edit-form-title");
    const descriptionInput = document.querySelector("#edit-form-description");
    if (titleInput) {
      titleInput.value = snapshot.title ?? titleInput.value;
      titleInput.defaultValue = titleInput.value;
    }
    if (descriptionInput) {
      descriptionInput.value = snapshot.description ?? descriptionInput.value;
      descriptionInput.defaultValue = descriptionInput.value;
    }

    editorList.replaceChildren();
    (snapshot.questions ?? []).forEach((questionData) => {
      const question = editorTemplate.content.firstElementChild.cloneNode(true);
      const id = questionData.id;
      question.dataset.questionId = id;
      question.dataset.savedType = questionData.savedType ?? "";
      question.dataset.savedAnswer = questionData.savedAnswer ?? "";
      question.dataset.savedOptionCount = String(questionData.savedOptionCount ?? 0);

      const typeField = question.querySelector("[data-question-type]");
      typeField.value = questionData.type ?? "multiple_choice";
      const textField = question.querySelector("[data-question-text-input]");
      textField.value = questionData.text ?? "";
      textField.defaultValue = questionData.textDefault ?? textField.value;
      textField.dataset.syncKey = `question-text-${id}`;

      const optionFieldset = question.querySelector("[data-question-options]");
      const noAnswerLabel = optionFieldset.querySelector(".no-correct-answer-choice");
      const noAnswerRadio = noAnswerLabel.querySelector("[data-correct-answer]");
      noAnswerRadio.name = `correct-${id}`;
      noAnswerRadio.checked = false;
      optionFieldset.querySelectorAll("[data-answer-row]").forEach((row) => row.remove());

      (questionData.options ?? []).forEach((optionData, index) => {
        const row = createEditorAnswerRow(id, optionData, index);
        optionFieldset.append(row);
      });

      const correctRadios = Array.from(question.querySelectorAll("[data-correct-answer]"));
      const selectedCorrectRadio = correctRadios[questionData.selectedCorrectIndex];
      if (selectedCorrectRadio) {
        selectedCorrectRadio.checked = true;
      } else if (questionData.selectedCorrectIndex < 0) {
        noAnswerRadio.checked = true;
      }

      question.querySelectorAll("[data-question-type-section]").forEach((section) => {
        section.hidden = section.dataset.questionTypeSection !== typeField.value;
      });
      question.querySelector("[data-question-type-toggle]").textContent = typeField.value === "short_text"
        ? "Switch to Multiple Choice"
        : "Switch to Short Response";
      editorList.append(question);
      window.FormForgeFormMode?.updateAnswerControls(question);
      window.FormForgeFormMode?.updateQuestionSaveButton(question);
    });

    previewList.replaceChildren();
    (snapshot.previewQuestions ?? []).forEach((previewData) => {
      const question = previewTemplate.content.firstElementChild.cloneNode(true);
      question.dataset.questionId = previewData.id;
      question.dataset.required = String(Boolean(previewData.required));
      question.dataset.correctAnswer = previewData.answer ?? "";
      question.hidden = Boolean(previewData.hidden);

      const heading = question.querySelector("h2");
      heading.dataset.previewKey = `question-text-${previewData.id}`;
      heading.textContent = previewData.text ?? "";

      const shortSection = question.querySelector('[data-preview-question-type="short_text"]');
      const multipleSection = question.querySelector('[data-preview-question-type="multiple_choice"]');
      shortSection.hidden = previewData.type !== "short_text";
      multipleSection.hidden = previewData.type !== "multiple_choice";
      const shortAnswer = shortSection.querySelector("textarea");
      shortAnswer.id = `preview-${previewData.id}`;
      shortAnswer.required = Boolean(previewData.required);
      shortSection.querySelector("label").htmlFor = shortAnswer.id;

      const optionFieldset = question.querySelector("[data-preview-options]");
      optionFieldset.replaceChildren();
      (previewData.options ?? []).forEach((value) => {
        const label = document.createElement("label");
        const radio = document.createElement("input");
        const text = document.createElement("span");
        radio.type = "radio";
        radio.name = previewData.id;
        radio.value = value;
        radio.required = Boolean(previewData.required);
        text.textContent = value;
        label.append(radio, text);
        optionFieldset.append(label);
      });
      previewList.append(question);
    });

    const previewTitle = document.querySelector("#preview-title");
    const previewDescription = document.querySelector('[data-preview-key="form-description"]');
    if (previewTitle) {
      previewTitle.textContent = snapshot.title ?? "";
    }
    if (previewDescription) {
      previewDescription.textContent = snapshot.description ?? "";
    }
  }

  function createEditorAnswerRow(questionID, optionData, index) {
    const row = document.createElement("div");
    const correctLabel = document.createElement("label");
    const correctRadio = document.createElement("input");
    const correctText = document.createElement("span");
    const optionInput = document.createElement("input");
    const deleteButton = document.createElement("button");

    row.className = "editor-answer-option";
    row.dataset.answerRow = "";
    correctLabel.className = "correct-answer-choice";
    correctRadio.type = "radio";
    correctRadio.name = `correct-${questionID}`;
    correctRadio.value = optionData.value ?? "";
    correctRadio.dataset.questionEditField = "";
    correctRadio.dataset.correctAnswer = "";
    correctText.textContent = "Correct";
    correctLabel.append(correctRadio, correctText);

    optionInput.type = "text";
    optionInput.value = optionData.value ?? "";
    optionInput.defaultValue = optionData.defaultValue ?? optionInput.value;
    optionInput.dataset.syncKey = `option-${questionID}-${index}`;
    optionInput.dataset.questionEditField = "";
    optionInput.dataset.questionOption = "";

    deleteButton.type = "button";
    deleteButton.className = "icon-button delete-answer-button";
    deleteButton.setAttribute("aria-label", "Delete answer");
    deleteButton.title = "Delete answer";
    deleteButton.dataset.deleteAnswer = "";
    deleteButton.textContent = "×";

    row.append(correctLabel, optionInput, deleteButton);
    return row;
  }

  function restoreViewMode(mode) {
    const showPreview = mode === "preview";
    editorViewForResponses.hidden = showPreview;
    previewViewForResponses.hidden = !showPreview;
    submissionView.hidden = true;
    if (viewModeToggleForResponses) {
      viewModeToggleForResponses.hidden = false;
      viewModeToggleForResponses.setAttribute("aria-pressed", String(showPreview));
      viewModeToggleForResponses.textContent = showPreview
        ? "Switch to Editor View"
        : "Switch to User Preview";
    }
  }

  function getCurrentViewMode() {
    if (!submissionView.hidden) {
      return "submission";
    }
    return previewViewForResponses.hidden ? "editor" : "preview";
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (stored && typeof stored === "object") {
        return {
          formSnapshot: stored.formSnapshot ?? null,
          draft: stored.draft && typeof stored.draft === "object" ? stored.draft : {},
          submission: stored.submission && Array.isArray(stored.submission.answers) ? stored.submission : null,
          mode: stored.mode ?? "editor",
        };
      }
    } catch (error) {
      console.warn("Could not restore saved form data.", error);
    }
    return { formSnapshot: null, draft: {}, submission: null, mode: "editor" };
  }

  function persistState() {
    state.formSnapshot = captureFormSnapshot();
    state.mode = getCurrentViewMode();
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn("Could not save form data in this browser.", error);
    }
  }

  function refreshDefinition() {
    const nextDefinition = getFormDefinition();
    if (nextDefinition === currentDefinition) {
      return;
    }

    currentDefinition = nextDefinition;
    state = { ...state, draft: {}, submission: null };
    clearPreviewAnswers();
    submissionView.hidden = true;
    persistState();
    updateSubmitButton();
  }

  function collectResponses() {
    return Array.from(previewViewForResponses.querySelectorAll("[data-preview-question]"), (question) => {
      const questionID = question.dataset.questionId;
      const heading = question.querySelector("h2")?.textContent ?? "";
      const shortAnswer = question.querySelector("textarea");
      if (isShortTextQuestion(question) && shortAnswer) {
        const value = shortAnswer.value;
        return {
          questionID,
          question: heading,
          answer: value,
          isAnswered: value.trim() !== "",
        };
      }

      const radios = Array.from(question.querySelectorAll('input[type="radio"]'));
      const selectedIndex = radios.findIndex((radio) => radio.checked);
      return {
        questionID,
        question: heading,
        answer: selectedIndex < 0 ? "" : radios[selectedIndex].value,
        isAnswered: selectedIndex >= 0,
      };
    });
  }

  function updateSubmitButton() {
    const responses = collectResponses();
    const canSubmit = responses.length > 0 && responses.every((response) => response.isAnswered);
    submitResponseButton.disabled = !canSubmit;
    if (submitGuidance) {
      submitGuidance.textContent = canSubmit
        ? "All questions are answered. You can submit your response."
        : "Answer every question to enable submission.";
    }
  }

  function saveDraft() {
    if (state.submission) {
      return;
    }
    const draft = {};
    previewViewForResponses.querySelectorAll("[data-preview-question]").forEach((question) => {
      const shortAnswer = question.querySelector("textarea");
      if (isShortTextQuestion(question) && shortAnswer) {
        draft[question.dataset.questionId] = { type: "short_text", value: shortAnswer.value };
        return;
      }
      const radios = Array.from(question.querySelectorAll('input[type="radio"]'));
      const selectedIndex = radios.findIndex((radio) => radio.checked);
      draft[question.dataset.questionId] = {
        type: "multiple_choice",
        value: selectedIndex < 0 ? "" : radios[selectedIndex].value,
        selectedIndex,
      };
    });
    state.draft = draft;
    persistState();
    updateSubmitButton();
  }

  function restoreDraft() {
    previewViewForResponses.querySelectorAll("[data-preview-question]").forEach((question) => {
      const saved = state.draft[question.dataset.questionId];
      if (!saved) {
        return;
      }
      const shortAnswer = question.querySelector("textarea");
      if (isShortTextQuestion(question) && shortAnswer && saved.type === "short_text") {
        shortAnswer.value = saved.value ?? "";
        return;
      }
      const radios = Array.from(question.querySelectorAll('input[type="radio"]'));
      if (saved.type === "multiple_choice") {
        const radio = Number.isInteger(saved.selectedIndex)
          ? radios[saved.selectedIndex]
          : radios.find((candidate) => candidate.value === saved.value);
        if (radio) {
          radio.checked = true;
        }
      }
    });
  }

  function clearPreviewAnswers() {
    previewViewForResponses.querySelectorAll("[data-preview-question]").forEach((question) => {
      question.querySelectorAll('input[type="radio"]').forEach((radio) => {
        radio.checked = false;
      });
      const shortAnswer = question.querySelector("textarea");
      if (shortAnswer) {
        shortAnswer.value = "";
      }
    });
  }

  function isShortTextQuestion(question) {
    return question.querySelector('[data-preview-question-type="short_text"]')?.hidden === false;
  }

  function showSubmission() {
    submittedAnswersList.replaceChildren();
    state.submission.answers.forEach((response) => {
      const item = document.createElement("li");
      const question = document.createElement("h2");
      const answer = document.createElement("p");
      item.className = "template-card assessment-question";
      question.textContent = response.question;
      answer.textContent = response.answer;
      item.append(question, answer);
      submittedAnswersList.append(item);
    });

    editorViewForResponses.hidden = true;
    previewViewForResponses.hidden = true;
    submissionView.hidden = false;
    if (viewModeToggleForResponses) {
      viewModeToggleForResponses.hidden = true;
    }
    state.mode = "submission";
    persistState();
  }
}
