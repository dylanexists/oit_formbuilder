package main

import (
	"html/template"
	"log"
	"net/http"
	"time"
)

type FormTemplate struct {
	ID          string
	Title       string
	Description string
	filterName  string
	filterValue string
}

type HomePageData struct {
	UsingFallback      bool
	MakeFailForTesting bool
	Templates          []FormTemplate
}

type Question struct {
	ID       string   `json:"id"`
	Form_ID  string   `json:"form_id"`
	Text     string   `json:"text"`
	Type     string   `json:"type"` // "short_text" or "multiple_choice"
	Required bool     `json:"required"`
	Answer   string   `json:"answer,omitempty"` // Empty means no correct answer is designated.
	Options  []string `json:"options,omitempty"`
}

type Form struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Questions   []Question `json:"questions"`
}

type Response struct {
	ID          string
	Question_ID string
	Content     string
}

func main() {
	pageTemplates, err := template.ParseFiles(
		"web/templates/home.tmpl.html",
		"web/templates/form.tmpl.html",
	)
	if err != nil {
		log.Fatalf("parse page templates: %v", err)
	}

	formTemplates := []FormTemplate{
		{
			ID:          "scientific-assessment",
			Title:       "Scientific Assessment Form",
			Description: "Science questions and discoveries.",
			filterName:  "categories",
			filterValue: "science",
		},
		{
			ID:          "movies-and-tv",
			Title:       "Movies & TV",
			Description: "Questions about movies and television.",
			filterName:  "categories",
			filterValue: "film_and_tv",
		},
		{
			ID:          "technology-and-computing",
			Title:       "Technology & Computing",
			Description: "Questions about computers and technology.",
			filterName:  "tags",
			filterValue: "computing,technology",
		},
		{
			ID:          "video-games",
			Title:       "Video Games",
			Description: "Questions about video games.",
			filterName:  "tags",
			filterValue: "video_games",
		},
		{
			ID:          "mathematics",
			Title:       "Mathematics",
			Description: "Questions about math and numbers.",
			filterName:  "tags",
			filterValue: "mathematics",
		},
		{
			ID:          "general-knowledge",
			Title:       "General Knowledge",
			Description: "A mix of interesting facts and topics.",
			filterName:  "categories",
			filterValue: "general_knowledge",
		},
	}

	homePage := HomePageData{Templates: formTemplates}
	templateByID := make(map[string]FormTemplate, len(formTemplates))
	for _, formTemplate := range formTemplates {
		templateByID[formTemplate.ID] = formTemplate
	}

	triviaClient := &http.Client{Timeout: 10 * time.Second}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		pageData := homePage
		pageData.MakeFailForTesting = r.URL.Query().Get("makeFailForTesting") == "true"

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if err := pageTemplates.ExecuteTemplate(w, "home", pageData); err != nil {
			log.Printf("render home page: %v", err)
			http.Error(w, "Could not render the home page", http.StatusInternalServerError)
		}
	})

	registerFormPageRoutes(mux, pageTemplates, templateByID, triviaClient)
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))

	log.Println("FormForge is running at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
