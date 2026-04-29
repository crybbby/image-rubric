"use client";

import type { RubricResult, ImageAnalysis, RubricIssue, Severity } from "@/types/rubric";

interface Props {
  result: RubricResult;
  images: string[];
  onReset: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  hero: "Hero",
  lifestyle: "Lifestyle",
  infographic: "Infographic",
  detail: "Detail",
  unknown: "General",
};

const severityConfig: Record<Severity, { label: string; bg: string; text: string; dot: string }> = {
  critical: { label: "Critical", bg: "bg-red-50", text: "text-red-800", dot: "bg-red-500" },
  major: { label: "Major", bg: "bg-orange-50", text: "text-orange-800", dot: "bg-orange-400" },
  minor: { label: "Minor", bg: "bg-yellow-50", text: "text-yellow-800", dot: "bg-yellow-400" },
};

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 75 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
  const ringColor =
    score >= 75 ? "stroke-green-500" : score >= 50 ? "stroke-yellow-500" : "stroke-red-500";
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          className={ringColor}
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={`absolute text-xl font-bold ${color}`}>{score}</span>
    </div>
  );
}

function IssueCard({ issue }: { issue: RubricIssue }) {
  const cfg = severityConfig[issue.severity];
  return (
    <div className={`rounded-lg p-3 ${cfg.bg} border border-${issue.severity === "critical" ? "red" : issue.severity === "major" ? "orange" : "yellow"}-100`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>
              {cfg.label}
            </span>
            <span className="text-xs text-gray-500">{issue.category}</span>
          </div>
          <p className="text-sm text-gray-800 mt-0.5">{issue.description}</p>
          <p className="text-sm text-gray-600 mt-1.5">
            <span className="font-medium">Fix:</span> {issue.fix}
          </p>
        </div>
      </div>
    </div>
  );
}

function ImageCard({ analysis, preview }: { analysis: ImageAnalysis; preview: string }) {
  const criticalCount = analysis.issues.filter((i) => i.severity === "critical").length;
  const majorCount = analysis.issues.filter((i) => i.severity === "major").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="w-full h-full object-contain" />
        </div>

        {/* Header info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  Image {analysis.imageIndex + 1}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {ROLE_LABELS[analysis.imageRole] ?? analysis.imageRole}
                </span>
              </div>
              <div className="flex gap-2 mt-1.5">
                {criticalCount > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                    {criticalCount} critical
                  </span>
                )}
                {majorCount > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    {majorCount} major
                  </span>
                )}
                {analysis.issues.length === 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    No issues
                  </span>
                )}
              </div>
            </div>
            <ScoreRing score={analysis.score} />
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Strengths */}
        {analysis.strengths.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              What&apos;s working
            </p>
            <ul className="space-y-1">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1 text-green-500 flex-shrink-0">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Issues */}
        {analysis.issues.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Issues to fix
            </p>
            <div className="space-y-2">
              {analysis.issues
                .sort((a, b) => {
                  const order = { critical: 0, major: 1, minor: 2 };
                  return order[a.severity] - order[b.severity];
                })
                .map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RubricResults({ result, images, onReset }: Props) {
  const { overallScore, overallVerdict, imageAnalysis, setLevelFeedback } = result;

  const scoreColor =
    overallScore >= 75
      ? "text-green-700 bg-green-50 border-green-200"
      : overallScore >= 50
      ? "text-yellow-700 bg-yellow-50 border-yellow-200"
      : "text-red-700 bg-red-50 border-red-200";

  const totalCritical = imageAnalysis.reduce(
    (sum, a) => sum + a.issues.filter((i) => i.severity === "critical").length,
    0
  );
  const totalMajor = imageAnalysis.reduce(
    (sum, a) => sum + a.issues.filter((i) => i.severity === "major").length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Overall score card */}
      <div className={`rounded-xl border p-6 ${scoreColor}`}>
        <div className="flex items-center gap-6">
          <ScoreRing score={overallScore} />
          <div>
            <h2 className="text-lg font-semibold">Overall Image Set Score</h2>
            <p className="text-sm mt-1 opacity-90">{overallVerdict}</p>
            <div className="flex gap-3 mt-3">
              {totalCritical > 0 && (
                <span className="text-xs bg-red-100 text-red-800 border border-red-200 px-2 py-1 rounded-full font-medium">
                  {totalCritical} critical issue{totalCritical !== 1 ? "s" : ""}
                </span>
              )}
              {totalMajor > 0 && (
                <span className="text-xs bg-orange-100 text-orange-800 border border-orange-200 px-2 py-1 rounded-full font-medium">
                  {totalMajor} major issue{totalMajor !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Set-level feedback */}
      <div className="grid md:grid-cols-3 gap-4">
        {setLevelFeedback.strengths.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Set Strengths
            </h3>
            <ul className="space-y-2">
              {setLevelFeedback.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {setLevelFeedback.gaps.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Story Gaps
            </h3>
            <ul className="space-y-2">
              {setLevelFeedback.gaps.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-gray-400 flex-shrink-0 mt-0.5">○</span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}

        {setLevelFeedback.priorityFixes.length > 0 && (
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">
              Priority Fixes
            </h3>
            <ol className="space-y-2">
              {setLevelFeedback.priorityFixes.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-blue-900">
                  <span className="font-bold text-blue-500 flex-shrink-0">{i + 1}.</span>
                  {f}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Per-image analysis */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Per-Image Breakdown</h2>
        <div className="space-y-4">
          {imageAnalysis.map((analysis) => (
            <ImageCard
              key={analysis.imageIndex}
              analysis={analysis}
              preview={images[analysis.imageIndex] ?? ""}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onReset}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Analyze another set
        </button>
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
        >
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
