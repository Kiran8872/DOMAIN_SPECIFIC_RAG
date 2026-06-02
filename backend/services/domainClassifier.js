import { traceStep } from "../utils/tracing.js";

const DOMAIN_KEYWORDS = {
  react: [
    "react", "component", "jsx", "props", "state", "usestate", "useeffect",
    "hook", "hooks", "render", "virtual dom", "vdom", "dom", "react router",
    "reactrouter", "usecontext", "usereducer", "custom hook", "component lifecycle",
    "useMemo", "useCallback", "useRef", "useImperativeHandle", "useLayoutEffect",
    "useDebugValue", "conditional rendering", "lists and keys", "events"
  ],
  javascript: [
    "javascript", "js", "variable", "let", "const", "var", "function", "arrow",
    "class", "object", "array", "promise", "async", "await", "module", "import",
    "export", "loop", "if else", "switch", "try catch", "error handling",
    "event loop", "closure", "prototype", "this", "bind", "apply", "call",
    "map", "filter", "reduce", "foreach"
  ],
  springboot: [
    "spring boot", "springboot", "spring", "boot", "dependency injection",
    "autowired", "bean", "restcontroller", "controller", "repository",
    "entity", "service", "jpa", "hibernate", "rest api", "api", "spring data",
    "spring security", "security", "jwt", "token", "actuator", "application properties",
    "application.yml", "application.yaml", "thymeleaf", "spring test", "test",
    "native image", "deployment", "tomcat", "jetty", "undertow", "mvc", "spring mvc",
    "webflux", "reactive", "r2dbc"
  ],
  java: [
    "java", "oop", "class", "object", "inheritance", "polymorphism", "encapsulation",
    "abstraction", "interface", "abstract class", "generics", "collection", "collections",
    "arraylist", "hashmap", "treemap", "linkedlist", "hashset", "treeset",
    "exception", "exceptions", "try", "catch", "finally", "throw", "throws",
    "io", "inputstream", "outputstream", "file", "concurrency", "thread", "threadpool",
    "executor", "synchronized", "volatile", "atomic", "jdbc", "sql", "connection",
    "statement", "preparedstatement", "resultset", "networking", "socket", "serversocket",
    "lambda", "stream", "stream api", "functional interface"
  ],
  mysql: [
    "mysql", "sql", "select", "insert", "update", "delete", "join", "inner join",
    "left join", "right join", "full join", "outer join", "index", "indexing",
    "transaction", "commit", "rollback", "savepoint", "stored procedure",
    "function", "trigger", "query optimization", "explain", "group by", "having",
    "order by", "limit", "offset", "primary key", "foreign key", "constraint",
    "table", "database", "schema", "view"
  ]
};

const CATEGORY_MAP = {
  react: "frontend",
  javascript: "frontend",
  springboot: "backend",
  java: "backend",
  mysql: "database"
};

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function calculateDomainScore(queryTokens, domainKeywords) {
  let score = 0;
  const matchedKeywords = [];

  for (const keyword of domainKeywords) {
    const keywordTokens = keyword.toLowerCase().split(/\s+/);
    let allMatch = true;

    for (const kt of keywordTokens) {
      if (!queryTokens.includes(kt)) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      score += keywordTokens.length;
      matchedKeywords.push(keyword);
    }
  }

  return { score, matchedKeywords };
}

export async function classifyQueryDomain(query) {
  return traceStep("classify_query_domain", async () => {
    const queryTokens = tokenize(query);
    const domainScores = {};
    let maxScore = 0;
    let bestDomain = null;

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const { score, matchedKeywords } = calculateDomainScore(queryTokens, keywords);
      domainScores[domain] = { score, matchedKeywords };

      if (score > maxScore) {
        maxScore = score;
        bestDomain = domain;
      }
    }

    if (maxScore === 0) {
      // If no specific domain matched, default to "general" but still try to use all domains
      return {
        domain: null,
        category: null,
        domainScores,
        strategy: "all_domains"
      };
    }

    return {
      domain: bestDomain,
      category: CATEGORY_MAP[bestDomain],
      domainScores,
      strategy: "domain_filtered"
    };
  });
}

export async function classifyQueryComplexity(query) {
  return traceStep("classify_query_complexity", async () => {
    const wordCount = query.trim().split(/\s+/).length;
    const hasMultipleTopics =
      /\b(and|or|between|vs|versus|difference|compare|comparison)\b/i.test(
        query,
      );
    const hasTechnicalDepth =
      /\b(implement|implementation|architecture|design|pattern|workflow|pipeline|end\s+to\s+end|e2e)\b/i.test(
        query,
      );

    let complexity = "simple";
    let reason = "";

    if (hasTechnicalDepth && hasMultipleTopics) {
      complexity = "complex";
      reason = "Query involves multiple topics and technical depth";
    } else if (hasMultipleTopics || wordCount > 20) {
      complexity = "medium";
      reason = "Query involves multiple topics or is longer";
    } else if (wordCount <= 10) {
      complexity = "simple";
      reason = "Short and straightforward query";
    } else {
      complexity = "medium";
      reason = "Moderate length query";
    }

    return { complexity, reason, wordCount, hasMultipleTopics, hasTechnicalDepth };
  });
}
