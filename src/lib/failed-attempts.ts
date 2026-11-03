import { challengeAnswers } from "./participant-answers";
import { saintQuestion } from "./local-game";
import type {
  Answers,
  LocalChallenge,
  LocalData,
  LocalProgress,
} from "./local-game";
export type FailureDetail = ReturnType<typeof challengeAnswers>[number] & {
  correctAnswer?: string | null;
};
export type FailedAttempt = {
  details?: FailureDetail[];
  id: string;
  challenge: LocalChallenge;
  answers: Answers;
  at: string;
  replacementId: string;
  currentId: string;
};
export function failedAttempts(
  data: LocalData,
  progress: LocalProgress,
): FailedAttempt[] {
  const records = [
    ...progress.failedExtras,
    ...progress.failedAnswers.map((record) => ({
      ...record,
      replacementId: record.extraId,
    })),
  ];
  return records.flatMap((record, index) => {
    const challenge = data.challenges.find((c) => c.id === record.challengeId);
    if (!challenge) return [];
    let currentId = record.replacementId;
    const visited = new Set<string>([record.challengeId]);
    while (!visited.has(currentId)) {
      visited.add(currentId);
      const replacement =
        progress.failedExtras.find((f) => f.challengeId === currentId)
          ?.replacementId ??
        progress.assignmentEdits
          .filter((edit) => edit.fromId === currentId && edit.toId)
          .at(-1)?.toId;
      if (!replacement) break;
      currentId = replacement;
    }
    return [
      {
        id: `${record.challengeId}:${record.at}:${index}`,
        challenge,
        answers: record.answers,
        at: record.at,
        replacementId: record.replacementId,
        currentId,
      },
    ];
  });
}
export function failedAttemptDetails(attempt: FailedAttempt): FailureDetail[] {
  if (attempt.details) return attempt.details;
  return challengeAnswers(attempt.challenge, attempt.answers).map(
    (detail, index) => {
      const challenge = attempt.challenge;
      const correctAnswer =
        challenge.kind === "quiz" && index < (challenge.questions?.length ?? 0)
          ? challenge.questions![index].options[
              challenge.questions![index].correctIndex
            ]
          : challenge.kind === "quiz" || challenge.kind === "code"
            ? challenge.code
            : challenge.kind === "saint"
              ? saintQuestion(challenge).options[
                  saintQuestion(challenge).correctIndex
                ]
              : detail.answer;
      return { ...detail, correctAnswer };
    },
  );
}
