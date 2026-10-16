import data from "./questionnaire-schema.json" with { type: "json" };

type Question = {
  key: string;
  type: string;
  label: string;
  reveal?: string;
  reveal_only?: boolean;
  points?: number;
  harmonize?: string;
};
type Questionnaire = {
  form_type?: number | string;
  answers?: Record<string, unknown>;
  odometer?: number | null;
  total_owners?: number | null;
};
const falseValues = new Set<unknown>([
  false,
  0,
  "0",
  "f",
  "F",
  "false",
  "FALSE",
  "off",
  "OFF",
]);
const blank = (value: unknown) => value == null || value === "";
function cast(
  question: Question,
  value: unknown,
): string | number | boolean | null {
  if (blank(value)) return null;
  if (["boolean", "ternary"].includes(question.type))
    return !falseValues.has(value);
  if (["number", "scale"].includes(question.type)) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const integer =
      typeof value === "number"
        ? Math.trunc(value)
        : Number.parseInt(value.trim(), 10);
    if (!Number.isSafeInteger(integer)) return null;
    if (
      question.type === "scale" &&
      (integer < 1 || integer > (question.points || 4))
    )
      return null;
    return integer;
  }
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

// Same ordering, Swedish labels and conditional follow-ups as
// Filter::QuestionnairePromptComponent. Unknown/removed fields never enter AI.
export function formatQuestionnaire(questionnaire: Questionnaire): string {
  const answers = questionnaire?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers))
    throw new Error("invalid_questionnaire");
  if (answers.legacy != null && answers.legacy !== false) {
    const legacy = answers.legacy as { lines?: unknown };
    const lines = legacy.lines;
    const pairs = Array.isArray(lines)
      ? lines
      : lines && typeof lines === "object"
        ? Object.entries(lines)
        : null;
    if (
      !pairs ||
      pairs.some(
        (line) =>
          !Array.isArray(line) ||
          line.length !== 2 ||
          line.some(
            (value) =>
              value != null &&
              typeof value !== "string" &&
              typeof value !== "number" &&
              typeof value !== "boolean",
          ),
      )
    )
      throw new Error("invalid_questionnaire");
    return pairs
      .map(([question, answer]) => `${question ?? ""}: ${answer ?? ""}\n`)
      .join("");
  }
  const form =
    questionnaire.form_type === 0 || questionnaire.form_type === "car_form"
      ? "car_form"
      : questionnaire.form_type === 1 ||
          questionnaire.form_type === "motorcycle_form"
        ? "motorcycle_form"
        : null;
  if (!form) throw new Error("invalid_questionnaire_type");
  const questions: Question[] = data.schemas[form];
  const lines: string[] = [];
  for (const question of questions.filter((q) => !q.reveal_only)) {
    let value = cast(question, answers[question.key]);
    if (value == null && ["odometer", "total_owners"].includes(question.key))
      value = cast(
        question,
        questionnaire[question.key as "odometer" | "total_owners"],
      );
    if (value == null || value === "") continue;
    const formatted = ["boolean", "ternary"].includes(question.type)
      ? value
        ? "Ja"
        : "Nej"
      : question.type === "scale"
        ? data.scale_labels[String(value) as keyof typeof data.scale_labels]
        : String(value);
    lines.push(`${question.label}: ${formatted}`);
    const bad = ["boolean", "ternary"].includes(question.type)
      ? value === false
      : question.type === "scale" &&
        (question.harmonize === "low"
          ? Number(value) > (question.points || 4) / 2
          : Number(value) <= (question.points || 4) / 2);
    if (bad && question.reveal) {
      const detail = questions.find((q) => q.key === question.reveal)!;
      const description = cast(detail, answers[question.reveal]);
      if (typeof description === "string" && description.trim())
        lines.push(`${detail.label}: ${description}`);
    }
  }
  return lines.length ? lines.join("\n") + "\n" : "";
}
