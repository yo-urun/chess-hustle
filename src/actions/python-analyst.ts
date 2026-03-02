'use server';

export async function callPythonAnalyst(pgns: string[], username: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/analyst`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pgns,
      username,
      api_key: process.env.GEMINI_API_KEY
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Python Analyst Error: ${err}`);
  }

  return await response.json();
}
