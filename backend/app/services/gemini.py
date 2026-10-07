import json
import logging
from typing import Dict, Any, List
import google.generativeai as genai
from app.core.config import settings

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            # Use gemini-1.5-flash or gemini-2.0-flash / default available
            self.model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                generation_config={"response_mime_type": "application/json"}
            )
        else:
            self.model = None

    def analyze_email(self, subject: str, sender: str, snippet: str, body: str) -> Dict[str, Any]:
        """
        Analyzes an email to:
        1. Categorize: 'Action Required', 'Follow-up', 'Newsletter', 'Spam/Promotions', 'FYI/Informational'
        2. Priority: 'High', 'Medium', 'Low'
        3. Extract Actionable Tasks with due dates / urgency
        4. Provide a 1-sentence executive summary
        5. Suggest a recommended quick reply
        """
        if not self.model:
            return {
                "category": "FYI/Informational",
                "priority": "Medium",
                "summary": snippet[:100],
                "tasks": [],
                "suggested_reply": ""
            }

        prompt = f"""
You are Hermes, an intelligent executive email organizer assistant.
Analyze the following email and return a valid JSON object matching the schema below.

Email Details:
- Subject: {subject}
- Sender: {sender}
- Snippet: {snippet}
- Content: {body[:3000]}

Response Schema (JSON):
{{
  "category": "Action Required" | "Follow-up" | "Newsletter" | "Spam/Promotions" | "FYI/Informational",
  "priority": "High" | "Medium" | "Low",
  "summary": "1 or 2 sentence concise executive summary",
  "tasks": [
    {{
      "title": "Clear task description",
      "deadline": "Extracted date or null if not mentioned",
      "urgency": "High" | "Medium" | "Low"
    }}
  ],
  "suggested_reply": "Brief helpful response draft or null"
}}

Strictly output only the raw JSON.
"""
        try:
            response = self.model.generate_content(prompt)
            result = json.loads(response.text)
            return result
        except Exception as e:
            logger.error(f"Error calling Gemini AI: {e}")
            return {
                "category": "FYI/Informational",
                "priority": "Medium",
                "summary": snippet or subject,
                "tasks": [],
                "suggested_reply": ""
            }

gemini_service = GeminiService()
