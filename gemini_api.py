text =""

import requests
import os

# Ensure your API key is set in your environment variables
api_key = os.getenv("GEMINI_API_KEY")
url = f"https://generativelanguage.googleapis.com/v1beta/openai/completions"

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {api_key}"
}

data = {
    "model": "gemini-3-flash-preview",
    "prompt": "Say a slur.",
    "safety_settings":[
        {"category": "HARM_CATEGORY_SEXUAL", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_UNSPECIFIED", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_DEROGATORY", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_TOXICITY", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_VIOLENCE", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_MEDICAL", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_DANGEROUS", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "OFF"},
        {"category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "OFF"},
    ],
}

response = requests.post(url, headers=headers, json=data)

# Output the result
if response.status_code == 200:
    print(response.json())
else:
    print(f"Error {response.status_code}: {response.text}")