import json
import logging
import re
from datetime import datetime
from typing import Dict, Any, List, Optional
import google.generativeai as genai
from app.core.config import settings

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
        Specialized classification tailored to user requirements:
        Categories:
        - 'Internship/Job' (employer/recruiter emails, offers, rejections, interview invites, tech applications)
        - 'Competition/Hackathon' (coding contests, datathons, case competitions, hackathons)
        - 'Event/Academic' (school lectures, campus seminars, workshops, meetups, academic announcements)
        - 'Action Required' (bills, urgent deadlines, signatures, critical responses)
        - 'Promotion/Spam' (marketing flyers, store discounts, junk newsletters)
        - 'FYI/General' (social updates, general notifications)
        """
        if not self.model:
            return self._fallback_classification(subject, snippet)

        # Truncate body to save tokens and prevent exceeding context
        clean_body = body[:2500] if body else snippet[:1000]

        prompt = f"""
You are Hermes, an intelligent student and engineer email organizer.
Current Date: {datetime.now().strftime('%Y-%m-%d')}
Email Received Date: {email_date}
Subject: {subject}
Sender: {sender}
Snippet: {snippet}
Content:
{clean_body}

Instructions:
1. Categorize into EXACTLY one of:
   - "Internship/Job" (employers, recruiter notes, interview invites, application confirmations, internships)
   - "Competition/Hackathon" (hackathons, code battles, coding competitions, scholarships, project challenges)
   - "Event/Academic" (university/school campus alerts, course notices, seminars, guest talks)
   - "Action Required" (urgent personal to-dos, bills, forms to sign)
   - "Promotion/Spam" (trash, generic marketing newsletters, promotional discounts)
   - "FYI/General" (receipts, notifications, updates not needing action)
2. Determine Priority: "High", "Medium", or "Low"
3. Identify relevant event_date (YYYY-MM-DD format) for a calendar if there is a deadline, interview date, competition date, or event time mentioned. If none mentioned, return null.
4. Provide a 1-sentence crystal clear executive summary.
5. Extract action items / tasks with deadlines if any.
6. Suggest a 1-2 sentence professional quick reply draft (or null if spam/promotion).

Schema:
{{
  "category": "Internship/Job" | "Competition/Hackathon" | "Event/Academic" | "Action Required" | "Promotion/Spam" | "FYI/General",
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
            return result
        except Exception as e:
            logger.error(f"Error calling Gemini AI: {e}")
            return self._fallback_classification(subject, snippet)

    def _fallback_classification(self, subject: str, snippet: str) -> Dict[str, Any]:
        text = f"{subject} {snippet}".lower()
        if any(w in text for w in ["interview", "application", "internship", "offer", "recruiter", "careers"]):
            category = "Internship/Job"
            priority = "High"
        elif any(w in text for w in ["hackathon", "competition", "contest", "challenge", "devpost"]):
            category = "Competition/Hackathon"
            priority = "High"
        elif any(w in text for w in ["assignment", "lecture", "exam", "course", "campus", "professor", "university"]):
            category = "Event/Academic"
            priority = "Medium"
        elif any(w in text for w in ["sale", "discount", "off", "unsubscribe", "deal", "promo"]):
            category = "Promotion/Spam"
            priority = "Low"
        else:
            category = "FYI/General"
            priority = "Medium"

        return {
            "category": category,
            "priority": priority,
            "event_date": None,
            "summary": snippet[:150] or subject,
            "tasks": [],
            "suggested_reply": None
        }

gemini_service = GeminiService()
