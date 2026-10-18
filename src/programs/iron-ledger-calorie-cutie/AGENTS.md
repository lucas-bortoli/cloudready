# Iron Ledger Calorie Cutie

A weight loss and calorie tracking app for CloudReady. The tone is disciplined and motivating, with a playful edge: "Iron Ledger" brings the grit; "Calorie Cutie" keeps it approachable.

## Product principles

- Help users track food, calories, and progress without shame or judgment.
- Treat weight loss as a personal goal, not an assumption about every user.
- Use clear, practical language. Keep motivational copy supportive rather than aggressive.
- Make logging quick and easy to correct.
- Show estimates as estimates. Never imply calorie counts or weight projections are exact.
- Respect privacy around food, weight, and health information.

## Health and safety

- Do not prescribe extreme calorie limits, rapid weight loss, fasting, or punitive exercise.
- Avoid labeling foods or users as "good," "bad," "cheating," or "failing."
- Encourage users to consult a qualified health professional for individualized medical or nutrition advice.
- Don't present the app as a medical device or a substitute for professional care.
- If a goal or recommendation could be unsafe, explain the concern calmly and offer a safer alternative.

## Interface and content

- Keep the visual style confident, clean, and friendly.
- Use "ledger" language for records and summaries, and light playful touches for encouragement.
- Prefer concise labels and direct actions, such as "Log a meal" or "Review today."
- Make empty, loading, and error states helpful and nonjudgmental.
- Ensure controls have clear labels and keyboard focus states; preserve the project's established semantic markup conventions.

## Implementation

- Follow the repository-level `AGENTS.md` instructions and existing patterns in neighboring programs.
- Add or update focused tests when behavior changes.

## AI Implementation

This is the first CloudReady project that will integrate with the "Sign in With ChatGPT" mechanism.

> Sign in with ChatGPT lets you sign in to participating apps and sites with your ChatGPT account. In supported apps, eligible ChatGPT Plus and Pro subscribers can also choose to use their ChatGPT plan for AI requests.
> Signing in and using your plan are separate permissions. You review what an app can access before you connect it.

This will be a system level language model provider - `MachineIntelligenceProvider`.

### OpenAI docs

- https://developers.openai.com/siwc/token-sharing-open-source

### CloudReady-specific info

ChatGPT auth info is stored in the system database, and is tied to the user profile.

`MachineIntelligenceProvider` exposes a method: `createClient()` (imperative API) / `useClient()` (component hook API) that can be used to invoke LLM capabilities. A client is tied to the provider. The provider is responsible for the authentication flow and key storage, and also for token renewals.

## Structure

The program's main interface is a tree view and a details pane. The three-view occupies a 1/3 of the width, and the details pane occupies the remaining width.

The tree view is organized in the following way (example structure):

- Year
  - Month
    - 01 (Wed)
      - Weigh-in: 94kg
      - Breakfast
        - Bread: 1 slice (100g)
          - (...macros...)
      - Lunch
        - Stroganoff (ID 4) - 100g
          - Total Carbohydrate: 5g
          - Dietary Fiber: 1g
          - Total Sugars 1g
          - Protein: 30g
          - Total Fat: 31g
          - Saturated Fat: 16g
          - Cholesterol: 130mg
          - Vitamin C: 2mg
          - Sodium: 460mg
          - Calcium: 45mg
          - Iron: 3mg
          - Potassium: 495mg
    - 02 (Thu)

The tree's nodes vary, but each one has a specific purpose. A meal's ingredients can also be composed. A composed ingredient is a saved food made from other ingredients, whose nutrition is calculated by combining theirs. For example, a chicken sandwich could use a saved "chicken salad" as one ingredient; if that chicken salad is defined as chicken breast and mayonnaise, the sandwich inherits the chicken salad's macros and adds the bread's macros.

The tree's hierarchy should support flexible summaries for whichever node the user selects. For example, selecting a month or year could show how weight changed over that period. The same approach can support summaries of meals, foods, and nutrients at different levels of the tree.

Store data in `/Programs/ILCC/Ledger.json` so the OS can provide file-level version history. Separately, include a monotonically increasing schema version in the JSON and implement migrations so the application can read and update data written by older versions.
