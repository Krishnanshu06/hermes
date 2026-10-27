import json
import logging
from typing import Dict, Any, List, Optional
import google.generativeai as genai
from app.core.config import settings
from app.core.db import get_categories

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self.model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                generation_config={"response_mime_type": "application/json"}
            )
        else:
            self.model = None

    def analyze_email(self, subject: str, sender: str, snippet: str, body: str, email_date: str = "") -> Dict[str, Any]:
        """
        Dynamically considers user-defined categories & descriptions.
        """
        # Fetch current active categories from database
        db_categories = get_categories()
        category_guidelines = []
        valid_cat_names = []
        for c in db_categories:
            valid_cat_names.append(c["id"])
            desc = c.get("description") or "Categorize according to the title name"
            category_guidelines.append(f'- "{c["id"]}": {desc}')

        categories_prompt_text = "\n".join(category_guidelines)
        categories_list_str = " | ".join([f'"{name}"' for name in valid_cat_names])

        if not self.model:
            return self._fallback_classification(subject, snippet, valid_cat_names)

        clean_body = body[:2500] if body else snippet[:1000]

        prompt = f"""
You are Hermes, an intelligent student and engineer email organizer.
Email Received Date: {email_date}
Subject: {subject}
Sender: {sender}
Snippet: {snippet}
Content:
{clean_body}

Instructions:
1. Categorize into EXACTLY one of the following user categories:
{categories_prompt_text}

2. Determine Priority: "High", "Medium", or "Low"
3. Identify relevant event_date (YYYY-MM-DD format) for a calendar if there is a deadline, interview date, competition date, test, or event time mentioned. If none mentioned, return null.
4. Provide a 1-sentence crystal clear executive summary.
5. Extract action items / tasks with deadlines if any.
6. Suggest a 1-2 sentence professional quick reply draft (or null if promotion/spam).

Schema:
{{
  "category": {categories_list_str},
  "priority": "High" | "Medium" | "Low",
  "event_date": "YYYY-MM-DD" or null,
  "summary": "Concise 1-sentence summary",
  "tasks": [
    {{
      "title": "Task title",
      "deadline": "Extracted date or null",
      "urgency": "High" | "Medium" | "Low"
    }}
  ],
  "suggested_reply": "Brief draft or null"
}}
Return strictly valid JSON only.
"""
        try:
            response = self.model.generate_content(prompt)
            result = json.loads(response.text)
            # Ensure assigned category matches one in list
            if result.get("category") not in valid_cat_names and valid_cat_names:
                result["category"] = valid_cat_names[0]
            return result
        except Exception as e:
            logger.error(f"Error calling Gemini AI: {e}")
            return self._fallback_classification(subject, snippet, valid_cat_names)

    def _fallback_classification(self, subject: str, snippet: str, valid_cat_names: List[str]) -> Dict[str, Any]:
        text = f"{subject} {snippet}".lower()
        if "internship" in text or "interview" in text:
            cat = "Internship/Job"
        elif "hackathon" in text or "contest" in text:
            cat = "Competition/Hackathon"
        elif "assignment" in text or "lecture" in text or "course" in text:
            cat = "Event/Academic"
        elif "urgent" in text or "bill" in text:
            cat = "Action Required"
        elif "sale" in text or "discount" in text or "unsubscribe" in text:
            cat = "Promotion/Spam"
        else:
            cat = "FYI/General"

        if cat not in valid_cat_names and valid_cat_names:
            cat = valid_cat_names[0]

        return {
            "category": cat,
            "priority": "Medium",
            "event_date": None,
            "summary": snippet[:150] or subject,
            "tasks": [],
            "suggested_reply": None
        }

gemini_service = GeminiService()
