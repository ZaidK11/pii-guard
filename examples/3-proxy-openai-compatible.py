"""
pii-guard Example 3: Proxy mode — Python + OpenAI client

When pii-guard runs as a proxy server (npm start), you can point any
OpenAI-compatible Python client at it. No Python dependencies on pii-guard itself.

Start the proxy:
  ANTHROPIC_API_KEY=sk-... TEMPLATE=enterprise npm start

Then use it like a normal OpenAI client:
"""

import os
from openai import OpenAI

# Point to pii-guard proxy instead of OpenAI API
client = OpenAI(
    api_key="not-needed",  # pii-guard uses its own configured key
    base_url="http://localhost:3000/v1",  # pii-guard endpoint
)

# Your agent code stays exactly the same
response = client.chat.completions.create(
    model="claude-opus-4-5",  # or gpt-4o — pii-guard auto-routes
    messages=[
        {
            "role": "user",
            "content": "Review KYC for john@example.com. SSN: 123-45-6789. Account: 987654321012."
        }
    ],
    max_tokens=512,
)

# Response contains restored original values
print(response.choices[0].message.content)
