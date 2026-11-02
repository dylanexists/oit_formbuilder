const editorView = document.querySelector("#editor-view");
const previewView = document.querySelector("#preview-view");
const viewModeToggle = document.querySelector("[data-view-mode-toggle]");
let newQuestionCount = 0;

document.querySelectorAll("[data-question-editor]").forEach(updateAnswerControls);

if (editorView && previewView && viewModeToggle) {
  viewModeToggle.addEventListener("click", () => {
    const showPreview = previewView.hidden;

    if (showPreview) {
      const unsavedQuestion = Array.from(editorView.querySelectorAll("[data-question-editor]"))
        .find((question) => !question.querySelector("[data-save-question]").disabled);
      if (unsavedQuestion) {
        const warning = unsavedQuestion.querySelector("[data-unsaved-warning]");
        const saveButton = unsavedQuestion.querySelector("[data-save-question]");
        warning.hidden = false;
        unsavedQuestion.scrollIntoView({ behavior: "smooth", block: "center" });
        saveButton.focus({ preventScroll: true });
        return;
      }
    }

    editorView.hidden = showPreview;
    previewView.hidden = !showPreview;
    viewModeToggle.setAttribute("aria-pressed", String(showPreview));
    viewModeToggle.textContent = showPreview
      ? "Switch to Editor View"
      : "Switch to User Preview";
  });
}

document.addEventListener("input", (event) => {
  const editorField = event.target;
  if (!(editorField instanceof HTMLInputElement || editorField instanceof HTMLTextAreaElement)) {
    return;
  }

  const questionEditor = editorField.closest("[data-question-editor]");
  if (questionEditor && editorField.hasAttribute("data-question-edit-field")) {
    if (editorField.hasAttribute("data-question-option")) {
      const correctAnswerRadio = editorField.closest("[data-answer-row]")?.querySelector("[data-correct-answer]");
      if (correctAnswerRadio) {
        correctAnswerRadio.value = editorField.value;
      }
    }
    updateQuestionSaveButton(questionEditor);
    return;
  }

  syncFieldToPreview(editorField);
});

document.addEventListener("change", (event) => {
  const answerRadio = event.target;
  if (!(answerRadio instanceof HTMLInputElement) || !answerRadio.hasAttribute("data-correct-answer")) {
    return;
  }

  const questionEditor = answerRadio.closest("[data-question-editor]");
  if (questionEditor) {
    updateQuestionSaveButton(questionEditor);
  }
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const typeToggle = event.target.closest("[data-question-type-toggle]");
  if (typeToggle) {
    toggleQuestionType(typeToggle.closest("[data-question-editor]"));
    return;
  }

  const addQuestionButton = event.target.closest("[data-add-question]");
  if (addQuestionButton) {
    addQuestion();
    return;
  }

  const addAnswerButton = event.target.closest("[data-add-answer]");
  if (addAnswerButton) {
    addAnswer(addAnswerButton.closest("[data-question-editor]"));
    return;
  }

  const deleteAnswerButton = event.target.closest("[data-delete-answer]");
  if (deleteAnswerButton) {
    deleteAnswer(deleteAnswerButton.closest("[data-question-editor]"), deleteAnswerButton.closest("[data-answer-row]"));
    return;
  }

  const deleteQuestionButton = event.target.closest("[data-delete-question]");
  if (deleteQuestionButton) {
    deleteQuestion(deleteQuestionButton.closest("[data-question-editor]"));
    return;
  }

  const saveButton = event.target.closest("[data-save-question]");
  if (saveButton) {
    saveQuestion(saveButton.closest("[data-question-editor]"));
  }
});

function syncFieldToPreview(editorField) {
  const syncKey = editorField.dataset.syncKey;
  if (!syncKey) {
    return;
  }

  document.querySelectorAll("[data-preview-key]").forEach((previewField) => {
    if (previewField.dataset.previewKey === syncKey) {
      previewField.textContent = editorField.value;
    }
  });
}

function toggleQuestionType(questionEditor) {
  if (!questionEditor) {
    return;
  }

  const typeField = questionEditor.querySelector("[data-question-type]");
  const nextType = typeField.value === "short_text" ? "multiple_choice" : "short_text";
  typeField.value = nextType;

  if (nextType === "multiple_choice") {
    ensureMinimumOptions(questionEditor);
  }

  questionEditor.querySelectorAll("[data-question-type-section]").forEach((section) => {
    section.hidden = section.dataset.questionTypeSection !== nextType;
  });
  updateAnswerControls(questionEditor);

  const toggleButton = questionEditor.querySelector("[data-question-type-toggle]");
  toggleButton.textContent = nextType === "short_text"
    ? "Switch to Multiple Choice"
    : "Switch to Short Response";

  updateQuestionSaveButton(questionEditor);
}

function ensureMinimumOptions(questionEditor) {
  const optionFieldset = questionEditor.querySelector("[data-question-options]");
  while (optionFieldset.querySelectorAll("[data-question-option]").length < 2) {
    const index = optionFieldset.querySelectorAll("[data-question-option]").length;
    appendAnswerRow(questionEditor, `Option ${index + 1}`, index === 0);
  }
  updateAnswerControls(questionEditor);
}

function appendAnswerRow(questionEditor, value, markCorrect = false) {
  const questionID = questionEditor.dataset.questionId;
  const optionFieldset = questionEditor.querySelector("[data-question-options]");
  const index = optionFieldset.querySelectorAll("[data-question-option]").length;
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
  correctRadio.value = value;
  correctRadio.dataset.questionEditField = "";
  correctRadio.dataset.correctAnswer = "";
  correctRadio.checked = markCorrect;
  correctText.textContent = "Correct";
  correctLabel.append(correctRadio, correctText);

  optionInput.type = "text";
  optionInput.value = value;
  optionInput.defaultValue = value;
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
  optionFieldset.append(row);
  return row;
}

function addQuestion() {
  const editorList = document.querySelector("#editor-questions");
  const previewList = document.querySelector("#preview-questions");
  const editorTemplate = document.querySelector("#editor-question-template");
  const previewTemplate = document.querySelector("#preview-question-template");
  if (!editorList || !previewList || !editorTemplate || !previewTemplate) {
    return;
  }

  newQuestionCount += 1;
  const questionID = `new-question-${Date.now()}-${newQuestionCount}`;
  const editorQuestion = editorTemplate.content.firstElementChild.cloneNode(true);
  const previewQuestion = previewTemplate.content.firstElementChild.cloneNode(true);
  editorQuestion.dataset.questionId = questionID;
  editorQuestion.querySelectorAll("[data-correct-answer]").forEach((radio) => {
    radio.name = `correct-${questionID}`;
  });

  const questionText = editorQuestion.querySelector("[data-question-text-input]");
  questionText.dataset.syncKey = `question-text-${questionID}`;
  previewQuestion.dataset.questionId = questionID;
  previewQuestion.hidden = true;
  const previewHeading = previewQuestion.querySelector("h2[data-preview-key]");
  previewHeading.dataset.previewKey = `question-text-${questionID}`;
  const previewShortAnswer = previewQuestion.querySelector("textarea");
  previewShortAnswer.id = `preview-${questionID}`;
  previewQuestion.querySelector("label").htmlFor = previewShortAnswer.id;

  editorQuestion.querySelectorAll("[data-question-option]").forEach((option, index) => {
    option.dataset.syncKey = `option-${questionID}-${index}`;
  });

  editorList.append(editorQuestion);
  previewList.append(previewQuestion);
  updateAnswerControls(editorQuestion);
  updateQuestionSaveButton(editorQuestion);
  questionText.focus();
}

function addAnswer(questionEditor) {
  if (!questionEditor || questionEditor.querySelector("[data-question-type]").value !== "multiple_choice") {
    return;
  }

  const options = questionEditor.querySelectorAll("[data-question-option]");
  appendAnswerRow(questionEditor, `Option ${options.length + 1}`);
  updateAnswerControls(questionEditor);
  updateQuestionSaveButton(questionEditor);
}

function deleteAnswer(questionEditor, answerRow) {
  const options = questionEditor?.querySelectorAll("[data-question-option]");
  if (!answerRow || !options || options.length <= 2) {
    return;
  }

  const wasCorrect = Boolean(answerRow.querySelector("[data-correct-answer]")?.checked);
  answerRow.remove();
  if (wasCorrect) {
    questionEditor.querySelector("[data-correct-answer]").checked = true;
  }
  updateAnswerControls(questionEditor);
  updateQuestionSaveButton(questionEditor);
}

function deleteQuestion(questionEditor) {
  if (!questionEditor) {
    return;
  }

  const questionID = questionEditor.dataset.questionId;
  document.querySelectorAll("[data-preview-question]").forEach((previewQuestion) => {
    if (previewQuestion.dataset.questionId === questionID) {
      previewQuestion.remove();
    }
  });
  questionEditor.remove();
}

function updateAnswerControls(questionEditor) {
  const isMultipleChoice = questionEditor.querySelector("[data-question-type]").value === "multiple_choice";
  const optionCount = questionEditor.querySelectorAll("[data-question-option]").length;
  questionEditor.querySelectorAll("[data-delete-answer]").forEach((button) => {
    button.hidden = !isMultipleChoice || optionCount <= 2;
  });
  const addButton = questionEditor.querySelector("[data-add-answer]");
  if (addButton) {
    addButton.hidden = !isMultipleChoice;
  }
}

function saveQuestion(questionEditor) {
  if (!questionEditor) {
    return;
  }

  const questionID = questionEditor.dataset.questionId;
  const previewQuestion = Array.from(document.querySelectorAll("[data-preview-question]"))
    .find((question) => question.dataset.questionId === questionID);
  if (!previewQuestion) {
    return;
  }

  const questionType = questionEditor.querySelector("[data-question-type]").value;
  questionEditor.querySelectorAll("[data-question-edit-field]").forEach((editorField) => {
    if (editorField.type !== "radio") {
      syncFieldToPreview(editorField);
      editorField.defaultValue = editorField.value;
    }
  });
  questionEditor.dataset.savedType = questionType;
  const correctAnswer = getSelectedCorrectAnswer(questionEditor);
  questionEditor.dataset.savedAnswer = correctAnswer;
  questionEditor.dataset.savedOptionCount = String(questionEditor.querySelectorAll("[data-question-option]").length);
  previewQuestion.dataset.correctAnswer = correctAnswer;
  previewQuestion.hidden = false;

  previewQuestion.querySelectorAll("[data-preview-question-type]").forEach((section) => {
    section.hidden = section.dataset.previewQuestionType !== questionType;
  });

  renderPreviewOptions(questionEditor, previewQuestion);
  updateQuestionSaveButton(questionEditor);
}

function renderPreviewOptions(questionEditor, previewQuestion) {
  const optionFieldset = previewQuestion.querySelector("[data-preview-options]");
  const questionID = questionEditor.dataset.questionId;
  const isRequired = previewQuestion.dataset.required === "true";
  const optionFields = questionEditor.querySelectorAll("[data-question-option]");

  optionFieldset.replaceChildren();
  optionFields.forEach((optionField, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");
    const previewKey = `option-${questionID}-${index}`;

    input.type = "radio";
    input.name = questionID;
    input.value = optionField.value;
    input.required = isRequired;
    text.dataset.previewKey = previewKey;
    text.textContent = optionField.value;
    label.append(input, text);
    optionFieldset.append(label);
    optionField.dataset.syncKey = previewKey;
  });
}

function updateQuestionSaveButton(questionEditor) {
  const saveButton = questionEditor.querySelector("[data-save-question]");
  const typeField = questionEditor.querySelector("[data-question-type]");
  const editorFields = questionEditor.querySelectorAll("[data-question-edit-field]");
  const typeChanged = typeField.value !== questionEditor.dataset.savedType;
  const selectedAnswer = getSelectedCorrectAnswer(questionEditor);
  const answerChanged = selectedAnswer !== questionEditor.dataset.savedAnswer;
  const optionCount = questionEditor.querySelectorAll("[data-question-option]").length;
  const optionCountChanged = optionCount !== Number(questionEditor.dataset.savedOptionCount ?? 0);
  const fieldChanged = Array.from(editorFields).some(
    (field) => field !== typeField && field.type !== "radio" && field.value !== field.defaultValue,
  );
  const hasChanges = typeChanged || answerChanged || optionCountChanged || fieldChanged;

  saveButton.disabled = !hasChanges;
  saveButton.classList.toggle("is-dirty", hasChanges);
  saveButton.textContent = hasChanges ? "Save changes" : "Save question";
  if (!hasChanges) {
    const warning = questionEditor.querySelector("[data-unsaved-warning]");
    if (warning) {
      warning.hidden = true;
    }
  }
}

function getSelectedCorrectAnswer(questionEditor) {
  const selectedRadio = questionEditor.querySelector("[data-correct-answer]:checked");
  if (!selectedRadio || selectedRadio.hasAttribute("data-no-correct-answer")) {
    return "";
  }
  return selectedRadio.value;
}

window.FormForgeFormMode = {
  updateAnswerControls,
  updateQuestionSaveButton,
};
