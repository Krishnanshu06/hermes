import json
import logging
import re
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types
from app.core.config import settings
from app.core.db import get_categories

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        if settings.GEMINI_API_KEY:
            self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
            # Reliable modern model
            self.primary_model = "gemini-3.5-flash"
            self.fallback_models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"]
        else:
            self.client = None

    def analyze_email(self, subject: str, sender: str, snippet: str, body: str, email_date: str = "") -> Dict[str, Any]:
        """
        Dynamically considers user-defined categories & descriptions.
        Uses modern google-genai SDK with guaranteed JSON output.
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

        if not self.client:
            return self._fallback_classification(subject, snippet, valid_cat_names)

        # Strip heavy HTML tags to provide clean, readable text to LLM
        clean_body = re.sub(r'<[^>]+>', ' ', body or "")
        clean_body = re.sub(r'\s+', ' ', clean_body).strip()
        clean_text = clean_body[:4000] if clean_body else snippet[:1500]

        prompt = f"""
You are Hermes, an elite executive AI email analyst.
Analyze this email and provide a high-clarity briefing.

Received Date: {email_date}
Subject: {subject}
Sender: {sender}

Email Content:
{clean_text}

Instructions:
1. Category: Select EXACTLY one from:
{categories_prompt_text}

2. Priority: "High" | "Medium" | "Low"

3. Calendar Date (event_date):
   - CRITICAL: Find any specific deadline, application deadline, session time, competition date, test, or event start date mentioned in the email.
   - Format: "YYYY-MM-DD" (e.g. "2026-11-04").
   - If relative (like "tomorrow" or "this Friday"), calculate using: {email_date}.
   - If none found, return null.

4. Executive Summary:
   - Provide a factual, crystal clear 1-2 sentence executive briefing explaining WHAT this email is announcing/requesting and WHAT the recipient needs to do.
   - Write clean plain English. Do NOT truncate or cut off. Do NOT use markdown stars ** or # headings.

5. Key Details:
   - 2 to 4 concise bullet points explaining key requirements, location, speakers, or deliverables.

6. Important Action Links:
   - Extract any actionable web URLs found in the email (registration links, forms, problem statements, meeting links, GitHub/portal links).
   - Format each as {{"label": "short name", "url": "https://..."}}.

7. Important Dates & Deadlines:
   - List all specific deadlines, session times, or milestones found (e.g. ["Registration Closes: Oct 30, 2026", "Session Starts: 4:45 PM"]).

Output format (strictly valid JSON):
{{
  "category": {categories_list_str},
  "priority": "High" | "Medium" | "Low",
  "event_date": "YYYY-MM-DD" or null,
  "summary": "Clear, complete executive briefing sentence without truncation",
  "key_details": ["Detail 1", "Detail 2"],
  "important_links": [{{"label": "Link label", "url": "https://..."}}],
  "important_dates": ["Date 1", "Date 2"]
}}
"""

        models_to_try = [self.primary_model] + self.fallback_models
        for model_name in models_to_try:
            try:
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json")
                )
                result = json.loads(response.text)
                if result.get("category") not in valid_cat_names and valid_cat_names:
                    result["category"] = valid_cat_names[0]

                # Format links if array of strings was returned
                if result.get("important_links"):
                    formatted_links = []
                    for l in result["important_links"]:
                        if isinstance(l, str):
                            formatted_links.append({"label": "Link", "url": l})
                        elif isinstance(l, dict) and "url" in l:
                            formatted_links.append(l)
                    result["important_links"] = formatted_links

                # Clean summary formatting
                if result.get("summary"):
                    result["summary"] = result["summary"].replace("**", "").replace("##", "").strip()

                return result
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}. Trying next...")

        logger.error("All Gemini models failed. Using fallback.")
        return self._fallback_classification(subject, snippet, valid_cat_names)

    def _fallback_classification(self, subject: str, snippet: str, valid_cat_names: List[str]) -> Dict[str, Any]:
        text = f"{subject} {snippet}".lower()
        if "internship" in text or "interview" in text:
            cat = "Internship/Job"
        elif "hackathon" in text or "contest" in text:
            cat = "Competition/Hackathon"
        elif "assignment" in text or "lecture" in text or "course" in text or "venue" in text:
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
            "summary": snippet or subject,
            "key_details": [],
            "important_links": [],
            "important_dates": [],
            "tasks": []
        }

gemini_service = GeminiService()
