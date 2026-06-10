import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const PRIORITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  HIGH: { bg: 'bg-red-50',    text: 'text-red-600',    label: 'HIGH' },
  MED:  { bg: 'bg-amber-50',  text: 'text-amber-600',  label: 'MED' },
  LOW:  { bg: 'bg-green-50',  text: 'text-green-600',  label: 'LOW' },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <span className="text-xs text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function TagList({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="mb-3">
      <p className="text-xs text-gray-400 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{v}</span>
        ))}
      </div>
    </div>
  );
}

export default function CarePlanPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'plan' | 'assessment'>('plan');

  useEffect(() => {
    if (!patientId) return;
    Promise.all([
      api.getCarePlan(patientId).catch(() => []),
      api.getCarePlanAssessment(patientId),
    ]).then(([plan, assess]) => {
      setItems(Array.isArray(plan) ? plan : []);
      setAssessment(assess);
    }).finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 text-xl leading-none">‹</button>
          <div>
            <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
            <h1 className="text-base font-bold text-gray-900">แผนการดูแลผู้ป่วย</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {(['plan', 'assessment'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                tab === t
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-400'
              }`}
            >
              {t === 'plan' ? `แผนการดูแล (${items.length})` : 'แบบประเมิน'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">

        {/* ── Tab: แผนการดูแล ── */}
        {tab === 'plan' && (
          <>
            {items.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm">ยังไม่มีแผนการดูแล</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const p = PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.MED;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl p-3.5 border ${item.isDone ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-sm">{item.isDone ? '✅' : '⬜'}</span>
                          <div>
                            <p className={`text-sm font-medium ${item.isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                              {item.title}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {item.frequency}
                              {item.assigneeName ? ` • ${item.assigneeName}` : ''}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${p.bg} ${p.text}`}>
                          {p.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Tab: แบบประเมิน ── */}
        {tab === 'assessment' && (
          <>
            {!assessment ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-3xl mb-2">📝</p>
                <p className="text-sm">ยังไม่มีข้อมูลการประเมิน</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Section title="ข้อมูลเบื้องต้น">
                  <div className="bg-white rounded-xl border border-gray-200 px-3 py-1">
                    <InfoRow label="วันที่ประเมิน" value={assessment.assessmentDate ? new Date(assessment.assessmentDate).toLocaleDateString('th-TH') : undefined} />
                    <InfoRow label="สถานที่พบ" value={assessment.locationFound} />
                    <InfoRow label="สถานะ" value={assessment.status} />
                    <InfoRow label="ประเภทไร้บ้าน" value={assessment.homelessType} />
                    <InfoRow label="Care Setting" value={assessment.careSetting} />
                    <InfoRow label="Referral Source" value={assessment.referralSource} />
                  </div>
                </Section>

                <Section title="สิทธิและหน่วยบริการ">
                  <div className="bg-white rounded-xl border border-gray-200 px-3 py-1">
                    <InfoRow label="สิทธิรักษาพยาบาล" value={assessment.healthcareRight} />
                    <InfoRow label="หน่วยบริการปฐมภูมิ" value={assessment.primaryCareUnit} />
                    <InfoRow label="หน่วยบริการรับส่งต่อ" value={assessment.referralUnit} />
                  </div>
                </Section>

                <Section title="โรคประจำตัว">
                  <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                    <TagList label="กลุ่มโรคเรื้อรัง (NCDs)" values={assessment.ncdConditions} />
                    <TagList label="กลุ่มโรคติดต่อ" values={assessment.infectiousConditions} />
                    <TagList label="สุขภาพจิตและระบบประสาท" values={assessment.mentalConditions} />
                    <TagList label="สารเสพติด" values={assessment.substanceConditions} />
                    <TagList label="ความพิการ / อุบัติเหตุ" values={assessment.disabilityConditions} />
                    {assessment.conditionNote && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">รายละเอียดเพิ่มเติม</p>
                        <p className="text-xs text-gray-700">{assessment.conditionNote}</p>
                      </div>
                    )}
                    {assessment.mentalConditionNote && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">โรคทางจิต</p>
                        <p className="text-xs text-gray-700">{assessment.mentalConditionNote}</p>
                      </div>
                    )}
                  </div>
                </Section>

                <Section title="เป้าหมายการช่วยเหลือ">
                  <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                    {assessment.helpGoal && (
                      <div className="mb-2">
                        <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-semibold">
                          {assessment.helpGoal}
                        </span>
                      </div>
                    )}
                    <TagList label="เป้าหมายทางการแพทย์" values={assessment.medicalGoals} />
                    {assessment.medicalGoalOther && (
                      <p className="text-xs text-gray-600">• {assessment.medicalGoalOther}</p>
                    )}
                    <TagList label="เป้าหมายทางสังคม" values={assessment.socialGoals} />
                    {assessment.socialGoalOther && (
                      <p className="text-xs text-gray-600">• {assessment.socialGoalOther}</p>
                    )}
                  </div>
                </Section>

                {assessment.notes && (
                  <Section title="Notes">
                    <div className="bg-white rounded-xl border border-gray-200 p-3">
                      <p className="text-xs text-gray-700 leading-relaxed">{assessment.notes}</p>
                    </div>
                  </Section>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
