package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"strings"
)

type FormPageData struct {
	Form               Form
	Error              string
	MakeFailForTesting bool
	UsingFallback      bool
}

type triviaQuestion struct {
	ID               string `json:"id"`
	Question         struct {
		Text string `json:"text"`
	} `json:"question"`
	CorrectAnswer    string   `json:"correctAnswer"`
	IncorrectAnswers []string `json:"incorrectAnswers"`
}

//go:embed internal/templatecatalog/fallback.json
var fallbackTemplateData []byte

// registerFormPageRoutes wires the form view route. Admin edit and preview
// routes can be added here as that workflow is built.
func registerFormPageRoutes(
	mux *http.ServeMux,
	pageTemplates *template.Template,
	templateByID map[string]FormTemplate,
	triviaClient *http.Client,
) {
	mux.HandleFunc("GET /forms/blank", func(w http.ResponseWriter, r *http.Request) {
		pageData := FormPageData{
			Form: Form{
				ID:          "blank",
				Title:       "Untitled Form",
				Description: "Add a description for your form.",
				Questions:   []Question{},
			},
		}
		renderFormPage(w, pageTemplates, pageData, http.StatusOK)
	})

	mux.HandleFunc("GET /forms/{templateID}", func(w http.ResponseWriter, r *http.Request) {
		formTemplate, ok := templateByID[r.PathValue("templateID")]
		if !ok {
			http.NotFound(w, r)
			return
		}

		makeFailForTesting := r.URL.Query().Get("makeFailForTesting") == "true"
		form, err := fetchTriviaTemplate(r.Context(), triviaClient, formTemplate, makeFailForTesting)
		pageData := FormPageData{Form: form, MakeFailForTesting: makeFailForTesting}
		status := http.StatusOK
		if err != nil {
			log.Printf("load %s questions: %v", formTemplate.ID, err)

			fallbackForm, fallbackErr := loadFallbackForm()
			if fallbackErr != nil {
				log.Printf("load local fallback form: %v", fallbackErr)
				pageData.Error = "The trivia API is unavailable, and the local fallback form could not be loaded."
				status = http.StatusBadGateway
			} else {
				pageData.Form = fallbackForm
				pageData.UsingFallback = true
			}
		}

		renderFormPage(w, pageTemplates, pageData, status)
	})
}

func renderFormPage(w http.ResponseWriter, pageTemplates *template.Template, pageData FormPageData, status int) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	if err := pageTemplates.ExecuteTemplate(w, "form", pageData); err != nil {
		log.Printf("render form page: %v", err)
	}
}

func fetchTriviaTemplate(
	ctx context.Context,
	client *http.Client,
	source FormTemplate,
	makeFailForTesting bool,
) (Form, error) {
	form := Form{
		ID:          source.ID,
		Title:       source.Title,
		Description: "Answer these questions. Choose one option for each question.",
	}
	query := url.Values{}
	query.Set("limit", "10")
	query.Set(source.filterName, source.filterValue)
	if makeFailForTesting {
		// An invalid category makes the API return a 400 response.
		query.Set("categories", "invalid-category-for-testing")
	}
	endpoint := "https://the-trivia-api.com/v2/questions?" + query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return form, err
	}
	response, err := client.Do(request)
	if err != nil {
		return form, err
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return form, fmt.Errorf("trivia API returned status %s", response.Status)
	}

	questions, err := convertTriviaJSONToQuestions(response.Body, form.ID)
	if err != nil {
		return form, err
	}
	form.Questions = questions

	return form, nil
}

func convertTriviaJSONToQuestions(body io.Reader, formID string) ([]Question, error) {
	var apiQuestions []triviaQuestion
	if err := json.NewDecoder(io.LimitReader(body, 1<<20)).Decode(&apiQuestions); err != nil {
		return nil, err
	}

	questions := make([]Question, 0, len(apiQuestions))
	for _, apiQuestion := range apiQuestions {
		questionText := strings.TrimSpace(apiQuestion.Question.Text)
		correctAnswer := strings.TrimSpace(apiQuestion.CorrectAnswer)
		if questionText == "" || correctAnswer == "" {
			continue
		}

		options := []string{correctAnswer}
		seenOptions := map[string]struct{}{correctAnswer: {}}
		for _, option := range apiQuestion.IncorrectAnswers {
			option = strings.TrimSpace(option)
			if option == "" {
				continue
			}
			if _, exists := seenOptions[option]; exists {
				continue
			}
			seenOptions[option] = struct{}{}
			options = append(options, option)
		}

		if len(options) < 2 {
			continue
		}

		rand.Shuffle(len(options), func(i, j int) {
			options[i], options[j] = options[j], options[i]
		})

		questions = append(questions, Question{
			ID:       apiQuestion.ID,
			Form_ID:  formID,
			Text:     questionText,
			Type:     "multiple_choice",
			Required: true,
			Answer:   correctAnswer,
			Options:  options,
		})
	}

	if len(questions) == 0 {
		return nil, errors.New("trivia API returned no usable multiple-choice questions")
	}

	return questions, nil
}

func loadFallbackForm() (Form, error) {
	var form Form
	if err := json.Unmarshal(fallbackTemplateData, &form); err != nil {
		return Form{}, fmt.Errorf("decode local fallback form: %w", err)
	}
	if strings.TrimSpace(form.ID) == "" || strings.TrimSpace(form.Title) == "" || len(form.Questions) == 0 {
		return Form{}, errors.New("local fallback form is missing required data")
	}

	for i := range form.Questions {
		question := &form.Questions[i]
		question.Form_ID = form.ID
		question.Text = strings.TrimSpace(question.Text)
		if question.Text == "" {
			return Form{}, fmt.Errorf("local fallback question %q has no text", question.ID)
		}
		if question.Type == "multiple_choice" && len(question.Options) < 2 {
			return Form{}, fmt.Errorf("local fallback question %q needs at least two options", question.ID)
		}
	}

	return form, nil
}
