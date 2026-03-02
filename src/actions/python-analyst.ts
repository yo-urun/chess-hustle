'use server';

export async function callPythonAnalyst(pgns: string[], username: string, deep: boolean = false) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/analyst`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pgns,
      username,
      deep
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Python Analyst Error: ${err}`);
  }

  return await response.json();
}
