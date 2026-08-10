const params = { limit: 10000, queryKey: ["sales"], signal: new AbortController().signal };
try {
    const query = new URLSearchParams(params).toString();
    console.log("SUCCESS:", query);
} catch (e) {
    console.error("ERROR:", e);
}
