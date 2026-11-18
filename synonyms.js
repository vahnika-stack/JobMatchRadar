/*
 * synonyms.js: the static skill dictionary (PRD section 15).
 *
 * Each key is a canonical skill id. `label` is how the skill is shown to the
 * user. `aliases` lists every spelling that should count as that skill.
 * Add a skill by adding an entry here; no other file needs to change.
 *
 * Avoid short, common English words as aliases ("go", "swift", "r"). They
 * would match ordinary sentences and inflate the score.
 */
globalThis.JMR_SYNONYMS = {
  javascript: { label: "JavaScript", aliases: ["javascript", "js", "ecmascript"] },
  typescript: { label: "TypeScript", aliases: ["typescript"] },
  react: { label: "React", aliases: ["react", "reactjs", "react.js"] },
  vue: { label: "Vue.js", aliases: ["vue", "vuejs", "vue.js"] },
  angular: { label: "Angular", aliases: ["angular", "angularjs"] },
  nextjs: { label: "Next.js", aliases: ["next.js", "nextjs"] },
  node: { label: "Node.js", aliases: ["node", "nodejs", "node.js"] },
  express: { label: "Express.js", aliases: ["express.js", "expressjs"] },
  html: { label: "HTML", aliases: ["html", "html5"] },
  css: { label: "CSS", aliases: ["css", "css3"] },
  tailwind: { label: "Tailwind CSS", aliases: ["tailwind", "tailwindcss", "tailwind css"] },
  python: { label: "Python", aliases: ["python"] },
  java: { label: "Java", aliases: ["java"] },
  cpp: { label: "C++", aliases: ["c++", "cpp"] },
  csharp: { label: "C#", aliases: ["c#", "csharp"] },
  rust: { label: "Rust", aliases: ["rust"] },
  sql: { label: "SQL", aliases: ["sql"] },
  postgresql: { label: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  mysql: { label: "MySQL", aliases: ["mysql"] },
  mongodb: { label: "MongoDB", aliases: ["mongodb", "mongo"] },
  redis: { label: "Redis", aliases: ["redis"] },
  graphql: { label: "GraphQL", aliases: ["graphql"] },
  aws: { label: "AWS", aliases: ["aws", "amazon web services"] },
  azure: { label: "Azure", aliases: ["azure", "microsoft azure"] },
  gcp: { label: "Google Cloud", aliases: ["gcp", "google cloud", "google cloud platform"] },
  docker: { label: "Docker", aliases: ["docker"] },
  kubernetes: { label: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  terraform: { label: "Terraform", aliases: ["terraform"] },
  jenkins: { label: "Jenkins", aliases: ["jenkins"] },
  linux: { label: "Linux", aliases: ["linux"] },
  git: { label: "Git", aliases: ["git"] },
  pandas: { label: "pandas", aliases: ["pandas"] },
  pytorch: { label: "PyTorch", aliases: ["pytorch"] },
  tensorflow: { label: "TensorFlow", aliases: ["tensorflow"] },
  spring: { label: "Spring Boot", aliases: ["spring boot", "springboot"] }
};
