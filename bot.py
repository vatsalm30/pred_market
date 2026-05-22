from google import genai
from google.genai import types

# Only run this block for Gemini Developer API
client = genai.Client(api_key='AIzaSyBE6uY-A4hBzseUGrDdApX9L-QQcHdwpxY')

print("Generating content using Gemini Developer API...")

response = client.models.generate_content(
    model='gemini-3.5-flash',
    contents=types.Part.from_text(text='Why is the sky blue?'),
    config=types.GenerateContentConfig(
        temperature=0,
        top_p=0.95,
        top_k=20,
    ),
)

print(response.text)