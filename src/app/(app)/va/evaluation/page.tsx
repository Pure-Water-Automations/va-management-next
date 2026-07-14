import { getCurrentUser, getEffectiveVaId } from "@/lib/auth/access";
import { getPendingSelfEvaluation, getPendingSupervisorEvaluations } from "@/lib/reads/evaluation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AssessmentForm } from "@/components/AssessmentForm";

export const dynamic = "force-dynamic";

export default async function VaEvaluationPage() {
  const user = await getCurrentUser();
  const vaId = await getEffectiveVaId(user);
  if (!vaId) {
    return (
      <div className="page-head"><div><h1>Evaluation</h1><p className="small">Your login isn’t linked to a VA record.</p></div></div>
    );
  }

  const [mine, asSupervisor] = await Promise.all([
    getPendingSelfEvaluation(vaId),
    getPendingSupervisorEvaluations(vaId),
  ]);

  const nothing = !mine && asSupervisor.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">My Console</div>
          <h1>Evaluation</h1>
        </div>
      </div>

      {nothing && (
        <Card>
          <p className="small" style={{ margin: 0 }}>Nothing to complete right now. Evaluations you need to complete will show up here.</p>
        </Card>
      )}

      {mine && (
        <Card style={{ marginBottom: 24 }}>
          <h2 style={h2}>Your self-assessment</h2>
          <p className="small" style={{ marginTop: 0, marginBottom: 18 }}>
            Rate yourself honestly on each area. Your supervisor completes a parallel assessment, and HR reviews both together.
          </p>
          <AssessmentForm evaluationId={mine.evaluationId} rubric={mine.rubric} kind="self" />
        </Card>
      )}

      {asSupervisor.map((ev) => (
        <Card key={ev.evaluationId} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <h2 style={{ ...h2, margin: 0 }}>Supervisor assessment</h2>
            <Badge variant="warning" dot>{ev.vaName ?? ev.vaId}</Badge>
          </div>
          <p className="small" style={{ marginTop: 0, marginBottom: 18 }}>
            You supervise {ev.vaName ?? "this VA"}. Score each area based on what you’ve observed, then give an overall recommendation.
          </p>
          <AssessmentForm evaluationId={ev.evaluationId} rubric={ev.rubric} kind="supervisor" subjectName={ev.vaName ?? undefined} />
        </Card>
      ))}
    </>
  );
}

const h2: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 12px" };
