import { formatQuestionnaire } from "../_shared/questionnaire.ts";
import { performAi } from "../_shared/ai.ts";
import { Database } from "../_shared/http.ts";
import { Job } from "../_shared/jobs.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function rejects(fn: () => unknown) {
  let caught = false;
  try {
    fn();
  } catch {
    caught = true;
  }
  assert(caught);
}

Deno.test(
  "car questionnaire uses Swedish labels, condition words and only applicable follow-ups",
  () => {
    const prompt = formatQuestionnaire({
      form_type: 0,
      answers: {
        odometer: 1225,
        vat: false,
        swedish_sold: "false",
        sale_country: "Tyskland",
        paint_condition: "2",
        paint_detail: "Stenskott",
        engine_condition: 4,
        engine_detail: "Hidden good-condition detail",
        climate_ok: null,
        climate_issue: "Hidden not-applicable detail",
        drivable_ok: "0",
        drivable_issue: "Startmotor trasig",
        body_condition: 3,
        glass_condition: 1,
        unknown_private_answer: "Never emit this",
        seller_type: "personal",
      },
    });
    assert(
      prompt ===
        [
          "Är du privat säljare eller handlare?: personal",
          "Mätarställning i kilometer: 1225",
          "Finns avdragsgill moms på fordonet?: Nej",
          "Är fordonet svensksålt?: Nej",
          "Vilket land importerades fordonet från?: Tyskland",
          "Hur är lackens skick?: Mindre bra",
          "Beskriv lackens brister: Stenskott",
          "Hur är karossens skick?: Bra",
          "Hur är rutornas skick?: Dåligt",
          "Hur är motorns skick?: Utmärkt",
          "Går fordonet att köra som det står?: Nej",
          "Beskriv varför det inte går att köra: Startmotor trasig",
          "",
        ].join("\n"),
      prompt,
    );
  },
);
Deno.test(
  "motorcycle schema excludes car-only fields and falls back to known lead values",
  () => {
    const prompt = formatQuestionnaire({
      form_type: 1,
      odometer: 20450,
      total_owners: 3,
      answers: {
        bodywork_condition: 2,
        bodywork_detail: "Repor i kåporna",
        frame_condition: 4,
        final_drive_condition: 1,
        final_drive_detail: "Sliten kedja",
        fork_condition: 3,
        interior_condition: 1,
        interior_detail: "Not a motorcycle question",
        climate_ok: false,
        total_owners: "",
        paint_condition: 9,
        drivable_ok: "",
        odometer_correct: true,
      },
    });
    for (const line of [
      "Mätarställning i kilometer: 20450",
      "Totalt antal ägare: 3",
      "Kan mätarställningen garanteras?: Ja",
      "Hur är kåpornas och plåtens skick?: Mindre bra",
      "Beskriv slutväxelns brister: Sliten kedja",
      "Hur är ramens skick?: Utmärkt",
    ])
      assert(prompt.includes(line), line);
    assert(!/interiör|klimat|lack|driva|Not a motorcycle/.test(prompt));
    assert(
      formatQuestionnaire({
        form_type: "car_form",
        odometer: 100,
        total_owners: 3,
        answers: { odometer: 0, total_owners: 1 },
      }).includes("kilometer: 0"),
    );
    rejects(() => formatQuestionnaire({ form_type: 99, answers: {} }));
  },
);
Deno.test(
  "legacy questionnaire lines preserve their original order and ignore schema answers",
  () => {
    for (const lines of [
      [
        ["Ägarhistorik", "Samma familj"],
        ["Extra", "Taklucka"],
      ],
      { Ägarhistorik: "Samma familj", Extra: "Taklucka" },
    ]) {
      assert(
        formatQuestionnaire({
          answers: { legacy: { lines }, odometer: 999 },
        }) === "Ägarhistorik: Samma familj\nExtra: Taklucka\n",
      );
    }
    rejects(() =>
      formatQuestionnaire({ answers: { legacy: { lines: "broken" } } }),
    );
  },
);
Deno.test(
  "lot text worker sends the formatted questionnaire and validates the returned draft",
  async () => {
    const oldFetch = globalThis.fetch;
    const vars = {
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_MODEL: "test-model",
    };
    const previous = Object.fromEntries(
      Object.keys(vars).map((key) => [key, Deno.env.get(key)]),
    );
    for (const [key, value] of Object.entries(vars)) Deno.env.set(key, value);
    const advances: Record<string, unknown>[] = [];
    const db = {
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === "website_ai_advance") advances.push(args);
        return Promise.resolve({
          data:
            name === "website_ai_run"
              ? {
                  id: "run",
                  kind: "lot_text",
                  stage: "generate",
                  source: {
                    name: "Lot fallback",
                    questionnaire: {
                      vehicle_name: "1990 Porsche 911",
                      form_type: 0,
                      answers: {
                        paint_condition: 2,
                        paint_detail: "Stenskott",
                        removed_key: "Do not send",
                      },
                    },
                  },
                }
              : null,
          error: null,
        });
      },
    } as unknown as Database;
    globalThis.fetch = async (input, init) => {
      assert(String(input) === "https://api.anthropic.com/v1/messages");
      const body = JSON.parse(String(init?.body));
      const prompt = body.messages[0].content;
      assert(prompt.includes("1990 Porsche 911"));
      assert(
        prompt.includes(
          "Hur är lackens skick?: Mindre bra\nBeskriv lackens brister: Stenskott",
        ),
      );
      assert(
        !prompt.includes("removed_key") &&
          !prompt.includes("Do not send") &&
          !prompt.includes("Lot fallback"),
      );
      return Response.json({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              body_sv: "<h2>Skick</h2><p>Stenskott.</p><script>bad()</script>",
            }),
          },
        ],
      });
    };
    try {
      await performAi(db, {
        id: "job",
        lease_token: "lease",
        payload: { run_id: "run", stage: "generate" },
      } as unknown as Job);
      assert(advances.length === 1);
      assert(
        (advances[0].p_result as Record<string, unknown>).body_sv ===
          "<h2>Skick</h2><p>Stenskott.</p>",
      );
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries(previous))
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  },
);
