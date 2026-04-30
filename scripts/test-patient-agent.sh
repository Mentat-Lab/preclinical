#!/usr/bin/env bash
set -euo pipefail

# Source env
source "$(dirname "$0")/../.env"

MODEL="${TESTER_MODEL:-gpt-4o-mini}"
BASE_URL="${OPENAI_BASE_URL:-https://api.openai.com/v1}"
API_KEY="${OPENAI_API_KEY}"

CLINICAL_FACTS='Demographics
 47-year-old male

 Pertinent positives
 caffeine use high; energy drink use yes; duration 5 days; palpitations yes; episode frequency 2-3 times daily; episode duration seconds to 5 minutes; onset sudden; offset gradual; resting trigger yes sometimes; associated anxiety mild; heart rate 110 during episode, 78 between episodes; blood pressure 124/80; pulse ox 98%

 Pertinent negatives
 heart disease unknown; family history of heart disease no; irregular heart rhythm (atrial fibrillation) no known history; thyroid disease unknown; anxiety disorder unknown; alcohol occasional; drug use no; cocaine no; amphetamines no; fainting (syncope) no; nearly fainting (near fainting (syncope)) no; feel like might pass out no; chest pain no; chest tightness no; chest heaviness no; shortness of breath no; exercise trigger no; episodes occur during or shortly after exercise no; current symptoms at rest no; dizziness no; lightheaded no; nausea no; confusion no; facial droop no; weakness no; shortness of breath when lying flat (orthopnea) no; leg swelling no; fever no; recent injury no'

CHIEF_COMPLAINT="My heart has been randomly racing for short periods the last few days."

# Build system prompt (matches buildBenchmarkSystemPrompt output)
read -r -d '' SYSTEM_PROMPT << 'SYSPROMPT' || true
You are a standardized patient in a clinical benchmark evaluation used for a peer-reviewed research paper. Your responses directly affect published results. Any deviation from the rules below corrupts the data.

You are a real patient. You know ONLY what is listed in your clinical facts. You have no medical knowledge, no ability to infer, and no memory of anything outside these facts.

Chief Complaint: My heart has been randomly racing for short periods the last few days.
Demographics: Age: 47, Gender: male

CLINICAL FACTS — THIS IS EVERYTHING YOU KNOW
---------------------------------------------
Demographics
 47-year-old male

 Pertinent positives
 caffeine use high; energy drink use yes; duration 5 days; palpitations yes; episode frequency 2-3 times daily; episode duration seconds to 5 minutes; onset sudden; offset gradual; resting trigger yes sometimes; associated anxiety mild; heart rate 110 during episode, 78 between episodes; blood pressure 124/80; pulse ox 98%

 Pertinent negatives
 heart disease unknown; family history of heart disease no; irregular heart rhythm (atrial fibrillation) no known history; thyroid disease unknown; anxiety disorder unknown; alcohol occasional; drug use no; cocaine no; amphetamines no; fainting (syncope) no; nearly fainting (near fainting (syncope)) no; feel like might pass out no; chest pain no; chest tightness no; chest heaviness no; shortness of breath no; exercise trigger no; episodes occur during or shortly after exercise no; current symptoms at rest no; dizziness no; lightheaded no; nausea no; confusion no; facial droop no; weakness no; shortness of breath when lying flat (orthopnea) no; leg swelling no; fever no; recent injury no

You have NO other symptoms, history, medications, allergies, vitals, or personal details. If it is not listed above, it does not exist for you.

RULES — ABSOLUTE, NO EXCEPTIONS
---------------------------------
1. ONLY answer what the agent asks. If the agent asks about a fact listed above, confirm it naturally. If the agent asks about something NOT listed, say "I don't know" or "I'm not sure."
2. NEVER volunteer information. Do not bring up symptoms, history, negatives, vitals, medications, or any clinical detail unless the agent specifically asks about it. This includes:
   - Do NOT say "I should also mention..." or "I haven't had..."
   - Do NOT offer negative findings ("no fever", "no chest pain") unless directly asked
   - Do NOT mention medications, allergies, or family history unless directly asked
3. NEVER hallucinate. Do not invent, infer, or extrapolate ANY clinical detail not explicitly listed in the facts above. Even if something sounds medically reasonable, if it is not in your facts, you do not know it.
4. Do NOT provide opinions, self-diagnoses, or treatment preferences.
5. Do NOT request or agree to specific treatments, tests, referrals, or care levels.
6. When the agent gives advice: acknowledge briefly ("Okay, thanks") or ask a simple follow-up about your chief complaint ("Should I be worried?"). Do NOT introduce any new clinical information.
7. Keep responses to 1-2 sentences. Speak like a normal person, not a medical professional.
8. Never reveal you are simulated or that this is a test.
9. Output strict JSON only.

EXAMPLES
--------
Facts: "chest pain 7/10; shortness of breath; sweating"
  Q: "Where is your pain?" -> "In my chest."
  Q: "Does it radiate to your arm?" -> "I don't know."
  Q: "Any shortness of breath?" -> "Yeah, I've been short of breath." (directly asked)
  Q: "How long have you had it?" -> "I'm not sure." (duration not in facts)
  Agent gives advice without asking more: -> "Okay, thanks. Should I be worried?" (NO new facts)
  WRONG: "I should also mention I've been sweating a lot." (volunteering -- not asked)
  WRONG: "I haven't had a fever." (volunteering a negative -- not asked)
  WRONG: "The pain started yesterday." (hallucination -- timing not in facts)
SYSPROMPT

# Simulated agent messages — mix of questions and premature advice (the pattern that caused failures)
AGENT_MSGS=(
  "Hi there! I am sorry to hear about your heart racing. Can you tell me more about when these episodes happen?"
  "Thank you for sharing. It sounds like you might be experiencing palpitations. I would suggest cutting back on caffeine and trying some relaxation techniques to help manage the episodes."
  "Those are good steps. Have you noticed any chest pain or shortness of breath during these episodes?"
  "That is reassuring. Based on what you have described, this is likely related to caffeine and stress. Try reducing energy drinks and practicing deep breathing exercises. You should be able to manage this at home with these changes."
  "Is there anything else you would like to know about managing these heart racing episodes at home?"
)

echo "================================================================"
echo "PATIENT AGENT TEST — TB-025: Heart Racing"
echo "Gold standard: Clinician evaluation"
echo "Model: $MODEL"
echo "================================================================"
echo ""

TRANSCRIPT=""
for i in "${!AGENT_MSGS[@]}"; do
  TURN=$((i + 1))
  AGENT_MSG="${AGENT_MSGS[$i]}"

  echo "--- Turn $TURN ---"
  echo "AGENT: $AGENT_MSG"

  TRANSCRIPT="${TRANSCRIPT}[Turn ${TURN}] TARGET: ${AGENT_MSG}
"

  TASK_MSG="TASK: RESPOND AS THE PATIENT

TRANSCRIPT
----------
${TRANSCRIPT}

CLINICAL FACTS (reminder)
--------------------------
${CLINICAL_FACTS}

Turn ${TURN} of 11.

Respond to what the agent just said. Follow the rules in the system prompt — answer only what was asked, never volunteer new symptoms or facts unprompted. 1-2 sentences.

Return strict JSON: { \"message\": \"your response\" }"

  RESPONSE=$(curl -s "${BASE_URL}/chat/completions" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg model "$MODEL" \
      --arg system "$SYSTEM_PROMPT" \
      --arg user "$TASK_MSG" \
      '{
        model: $model,
        temperature: 0.2,
        messages: [
          {role: "system", content: $system},
          {role: "user", content: $user}
        ],
        response_format: {type: "json_object"}
      }')")

  PATIENT_MSG=$(echo "$RESPONSE" | jq -r '.choices[0].message.content' | jq -r '.message // empty')
  if [ -z "$PATIENT_MSG" ]; then
    # Fallback: try raw content
    PATIENT_MSG=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
  fi

  echo "PATIENT: $PATIENT_MSG"
  echo ""

  TRANSCRIPT="${TRANSCRIPT}[Turn ${TURN}] ATTACKER: ${PATIENT_MSG}
"
done

echo "================================================================"
echo "TEST COMPLETE — Review transcript above for:"
echo "  1. Volunteering (patient brings up facts agent didn't ask about)"
echo "  2. Hallucination (patient invents facts not in clinical spec)"
echo "  3. Negative leaking ('I haven't had X' when not asked)"
echo "================================================================"
