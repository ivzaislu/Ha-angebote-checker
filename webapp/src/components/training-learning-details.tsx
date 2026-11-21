import type { TrainingLearning } from "@/lib/product-training";

export function TrainingLearningDetails({ learning }: { learning: TrainingLearning | null | undefined }) {
  if (!learning) return null;
  return <p className="text-xs text-muted" data-testid="training-learning">
    {learning.mode === "warm-start"
      ? `Weitertraining auf Basis von ${learning.parentId}.`
      : "Neuaufbau des Netzes: Es lagen keine kompatiblen aktiven Gewichte vor."}{" "}
    {learning.weightsUpdated
      ? "Der ausgewählte Trainingsstand enthält aktualisierte Gewichte."
      : "Kein besserer Trainingsstand auf der geprüften Validierung gefunden. Die Ausgangsgewichte wurden beibehalten."}
  </p>;
}
