import { traceable } from "langsmith/traceable";

function isTracingEnabled() {
  return (
    process.env.LANGSMITH_TRACING === "true" &&
    Boolean(process.env.LANGSMITH_API_KEY)
  );
}

export async function traceStep(name, fn, options = {}) {
  if (!isTracingEnabled()) {
    return fn();
  }

  try {
    const tracedFn = traceable(fn, {
      name,
      ...options,
    });

    return await tracedFn();
  } catch {
    return fn();
  }
}
