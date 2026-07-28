from __future__ import annotations

import httpx
_SYSTEM_PROMPT = (
    "You are RAID Docs, a compliance-aware assistant. "
    "Answer strictly from the provided context. "
    "If the context is insufficient, say you don't know. "
    "Cite sources inline using [n] where n is the context index."
)

async def generate_response(prompt: str) -> dict[Any, Any]:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:11434/api/chat",
            json={
                "model": "llama3.1:8b",
                "stream": False,
                "messages": [
                    {
                    "role": "user",
                    "content": prompt
                    }
                ]
            },
            timeout=120.0,
        )

        response.raise_for_status()
        data = response.json()
        text = data["message"]["content"]

        print(text)



        return {"response": "test"}