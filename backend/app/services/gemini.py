import json
import logging
import re
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
        Extracts:
        - executive summary (plain text, high clarity)
        - exact deadline / event_date (YYYY-MM-DD)
        - key highlights & details (bullet points)
        - important actionable links (URL and label)
        - dates mentioned
        """
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

        # Clean HTML tags from body before giving to LLM to save tokens and focus on content
        clean_body = re.sub(r'<[^>]+>', ' ', body or "")
        clean_body = re.sub(r'\s+', ' ', clean_body).strip()
        clean_text = clean_body[:3500] if clean_body else snippet[:1000]

        prompt = f"""
You are Hermes, an elite executive email intelligence assistant.
Analyze this incoming email carefully.

Received Date: {email_date}
Subject: {subject}
Sender: {sender}
Snippet: {snippet}

Content:
{clean_text}

Instructions:
1. Category: Assign to EXACTLY one of:
{categories_prompt_text}

2. Priority: "High" | "Medium" | "Low"

3. Calendar Date (event_date):
   - VERY IMPORTANT: Find any specific deadline, application due date, interview slot, competition date, test, or event start date mentioned in the email.
   - Format MUST be "YYYY-MM-DD" (e.g. "2026-11-04").
   - If a relative date is given (like "tomorrow" or "next Friday"), resolve it using the email received date: {email_date}.
   - If no event/deadline is mentioned anywhere, return null.

4. Executive Summary:
   - Provide a direct, factual 1-to-2 sentence summary of WHAT this email is about and WHAT is required.
   - Output plain readable text only (no awkward markdown, raw markdown escapes, or asterisks).

5. Important Links:
   - Extract any actionable URLs (e.g. application form, RSVP link, portal, meeting link, problem statement, portal login).
   - If none found in content, return empty array [].

6. Key Dates & Deadlines:
   - List all dates/times specified in the email with a brief label (e.g. "Registration Closes: Oct 30, 11:59 PM").

7. Tasks:
   - Concrete action items.

Schema (JSON):
{{
  "category": {categories_list_str},
  "priority": "High" | "Medium" | "Low",
  "event_date": "YYYY-MM-DD" or null,
  "summary": "Clear, direct, factual summary without weird formatting",
  "key_details": [
    "Key point 1",
    "Key point 2"
  ],
  "important_links": [
    {{
      "label": "Short link name (e.g. Apply Here, View Details)",
      "url": "https://..."
    }}
  ],
  "important_dates": [
    "Nov 2, 2026: Submissions Due"
  ],
  "tasks": [
    {{
      "title": "Clear task description",
      "deadline": "YYYY-MM-DD" or null,
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
            if result.get("category") not in valid_cat_names and valid_cat_names:
                result["category"] = valid_cat_names[0]
            
            # Clean summary of any accidental markdown symbols
            if result.get("summary"):
                result["summary"] = result["summary"].replace("**", "").replace("##", "").strip()

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
            "summary": snippet[:200] or subject,
            "key_details": [],
            "important_links": [],
            "important_dates": [],
            "tasks": [],
            "suggested_reply": None
        }

gemini_service = GeminiService()
