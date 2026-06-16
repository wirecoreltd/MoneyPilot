import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";
import { Plus, Trash2, X, Check, Pencil, ChevronDown, ChevronUp } from "lucide-react";

// ─── Mock data (remplace par les vrais imports de storage.ts) ─────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("fr-MU", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n);

const MOCK_INCOMES = [
  { id: "1", label: "Salaire", amount: 28000, isFixed: true, month: "2025-06" },
  { id: "2", label: "Freelance", amount: 4500, isFixed: false, month: "2025-06" },
];
const MOCK_CHECKLIST = [
  { id: "r1", source: "recurring", name: "Loyer", emoji: "🏠", amount: 9500, defaultAmount: 9500, paid: true, category: "logement" },
  { id: "r2", source: "recurring", name: "Assurance", emoji: "🛡️", amount: 1800, defaultAmount: 1800, paid: true, category: "assurance" },
  { id: "d1", source: "debt", name: "Prêt BCP", emoji: "💳", amount: 4200, defaultAmount: 4200, paid: false, hasTotal: true },
  { id: "r3", source: "recurring", name: "Internet", emoji: "⚡", amount: 850, defaultAmount: 850, paid: false, category: "factures" },
];
const MOCK_SAVINGS = [
  { id: "s1", name: "Fonds urgence", target: 80000, saved: 60000, emoji: "🛡️" },
  { id: "s2", name: "Vacances", target: 30000, saved: 12000, emoji: "✈️" },
];
const MOCK_DEBTS = [{ id: "d1", type: "owe", person: "Prêt BCP", amount: 120000, remaining: 18000, minimumPayment: 4200, category: "Dette" }];
const MOCK_PLAN = { totalIncome: 32500, fixedCharges: 9500, debtMinimums: 4200, variableEstimate: 4800, freeMoney: 14000, snowballSuggestion: 7000, savingsSuggestion: 4200, leisureSuggestion: 2800, alerts: [] };

// 12-month projection mock
const NOW = new Date();
const MOCK_PROJECTION = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(NOW.getFullYear(), i, 1);
  const label = d.toLocaleDateString("fr-FR", { month: "short" });
  const income = 30000 + Math.round(Math.random() * 5000);
  const expenses = 18000 + Math.round(Math.random() * 4000);
  return { month: `${NOW.getFullYear()}-${String(i + 1).padStart(2, "0")}`, label, projectedIncome: income, projectedExpenses: expenses, projectedBalance: (income - expenses) * (i + 1) * 0.7 };
});

// 6-month bar data mock
const MOCK_6M = Array.from({ length: 6 }, (_, i) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - (5 - i), 1);
  return {
    month: d.toLocaleDateString("fr-FR", { month: "short" }),
    Revenus: 28000 + Math.round(Math.random() * 6000),
    Dépenses: 16000 + Math.round(Math.random() * 5000),
  };
});

// ─── Sub-components ───────────────────────────────────────────────────────────

// Coach IA banner
function CoachBanner({ message }) {
  return (
    <div style={{ background: "linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)", border: "1.5px solid #BFDBFE", borderRadius: 20, padding: "14px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>💡</span>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#2563EB", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Coach IA</p>
        <p style={{ fontSize: 14, color: "#1E3A5F", fontWeight: 500, lineHeight: 1.45 }}>{message}</p>
      </div>
    </div>
  );
}

// KPI card
function KpiCard({ label, value, color, bg, icon }) {
  return (
    <div style={{ background: bg, borderRadius: 20, padding: "16px 14px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</p>
      </div>
      <p style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color, letterSpacing: "-0.5px" }}>{value}</p>
    </div>
  );
}

// Section card wrapper
function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", borderRadius: 24, padding: "18px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return <p style={{ fontSize: 10, fontWeight: 800, color: "#8896B0", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 14 }}>{children}</p>;
}

// ─── Health score gauge ───────────────────────────────────────────────────────
function HealthGauge({ score = 84 }) {
  const [displayed, setDisplayed] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    let start = null;
    const duration = 1200;
    const animate = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * score));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [score]);

  const color = score >= 80 ? "#16A34A" : score >= 60 ? "#2563EB" : score >= 40 ? "#D97706" : "#DC2626";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Bien" : score >= 40 ? "À améliorer" : "Fragile";

  // SVG arc
  const R = 68, cx = 90, cy = 90;
  const startAngle = -210, endAngle = 30; // 240° sweep
  const toRad = (a) => (a * Math.PI) / 180;
  const arcX = (a) => cx + R * Math.cos(toRad(a));
  const arcY = (a) => cy + R * Math.sin(toRad(a));
  const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
  const fillAngle = startAngle + (displayed / 100) * (endAngle - startAngle);

  const trackD = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${R} ${R} 0 1 1 ${arcX(endAngle)} ${arcY(endAngle)}`;
  const fillD = displayed > 0
    ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${R} ${R} 0 ${fillAngle - startAngle > 180 ? 1 : 0} 1 ${arcX(fillAngle)} ${arcY(fillAngle)}`
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="180" height="130" viewBox="0 0 180 130">
        <path d={trackD} fill="none" stroke="#E8EDF5" strokeWidth={10} strokeLinecap="round" />
        {fillD && <path d={fillD} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" style={{ transition: "stroke 0.3s" }} />}
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={36} fontWeight={800} fill={color} fontFamily="monospace">{displayed}</text>
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize={11} fill="#8896B0">/ 100 · {label}</text>
        <text x={cx} y={cy + 42} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>Score global</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-around", width: "100%", marginTop: 4 }}>
        {[
          { label: "Taux épargne", value: "34%" },
          { label: "Endettement", value: "15%" },
          { label: "Fonds urgence", value: "5 mois" },
        ].map((m) => (
          <div key={m.label} style={{ textAlign: "center" }}>
            <p style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: "#1E3A5F" }}>{m.value}</p>
            <p style={{ fontSize: 10, color: "#8896B0", marginTop: 2 }}>{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Income Statement (P&L) ───────────────────────────────────────────────────
function IncomeStatement({ plan }) {
  const rows = [
    { label: "Revenus", amount: plan.totalIncome, sign: "+", color: "#16A34A", bold: false },
    { label: "Charges fixes", amount: plan.fixedCharges, sign: "−", color: "#DC2626", bold: false },
    { label: "Paiements de dettes", amount: plan.debtMinimums, sign: "−", color: "#DC2626", bold: false },
    { label: "Dépenses variables", amount: plan.variableEstimate, sign: "−", color: "#D97706", bold: false },
  ];
  const netPct = plan.totalIncome > 0 ? Math.round((plan.freeMoney / plan.totalIncome) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F1F3F9" }}>
          <span style={{ fontSize: 13, color: "#4A5568" }}>{r.label}</span>
          <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: r.color }}>{r.sign} {fmt(r.amount)}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#1E3A5F" }}>Résultat net</span>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: plan.freeMoney >= 0 ? "#16A34A" : "#DC2626" }}>{fmt(plan.freeMoney)}</p>
          <p style={{ fontSize: 11, color: "#8896B0" }}>{netPct}% net</p>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ marginTop: 10, height: 6, background: "#F1F3F9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, netPct)}%`, background: plan.freeMoney >= 0 ? "#16A34A" : "#DC2626", borderRadius: 99, transition: "width 0.8s ease" }} />
      </div>
      {/* Suggestions */}
      {plan.freeMoney > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
          {[
            { label: "🎯 Dettes", amount: plan.snowballSuggestion, bg: "#FEF2F2", color: "#DC2626" },
            { label: "🐖 Épargne", amount: plan.savingsSuggestion, bg: "#EFF6FF", color: "#2563EB" },
            { label: "🎉 Loisirs", amount: plan.leisureSuggestion, bg: "#F0FDF4", color: "#16A34A" },
          ].map((s) => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: s.color }}>{s.label}</p>
              <p style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 12, color: s.color, marginTop: 4 }}>{fmt(s.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────
function BalanceSheet({ savings, debts }) {
  const totalSavings = savings.reduce((s, g) => s + g.saved, 0);
  const totalProjects = 12000; // mock
  const totalAssets = totalSavings + totalProjects;
  const totalDebt = debts.filter((d) => d.type === "owe").reduce((s, d) => s + d.remaining, 0);
  const netWorth = totalAssets - totalDebt;

  const Section = ({ title, rows, total, totalColor }) => (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: "#1E3A5F", marginBottom: 8 }}>{title}</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F1F3F9" }}>
          <span style={{ fontSize: 12, color: "#4A5568" }}>{r.label}</span>
          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#4A5568" }}>{fmt(r.amount)}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#1E3A5F" }}>Total {title.toLowerCase()}</span>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: totalColor }}>{fmt(total)}</span>
      </div>
    </div>
  );

  return (
    <div>
      <Section title="Actifs" rows={[{ label: "Épargne objectifs", amount: totalSavings }, { label: "Projets financés", amount: totalProjects }]} total={totalAssets} totalColor="#16A34A" />
      <div style={{ height: 1, background: "#E8EDF5", margin: "4px 0 16px" }} />
      <Section title="Passifs" rows={[{ label: "Dettes personnelles", amount: totalDebt }]} total={totalDebt} totalColor="#DC2626" />
      <div style={{ height: 1, background: "#E8EDF5", margin: "4px 0 12px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#1E3A5F" }}>Patrimoine net</span>
        <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: "#7C3AED" }}>{fmt(netWorth)}</span>
      </div>
    </div>
  );
}

// ─── Checklist ────────────────────────────────────────────────────────────────
function ChecklistSection({ checklist, onToggle, onDeleteRecurring }) {
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const paidCount = checklist.filter((i) => i.paid).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <p style={{ fontSize: 12, color: "#8896B0" }}>{paidCount}/{checklist.length} payés</p>
        <button style={{ width: 34, height: 34, borderRadius: 12, background: "#EFF6FF", color: "#2563EB", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</button>
      </div>
      {checklist.length > 0 && (
        <div style={{ height: 6, background: "#F1F3F9", borderRadius: 99, overflow: "hidden", marginBottom: 4 }}>
          <div style={{ height: "100%", width: `${(paidCount / checklist.length) * 100}%`, background: "#16A34A", borderRadius: 99, transition: "width 0.6s ease" }} />
        </div>
      )}
      {checklist.map((item) => (
        <div key={`${item.source}-${item.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 16, background: item.paid ? "#F0FDF4" : "#F8F9FC", transition: "background 0.2s" }}>
          <button
            onClick={() => onToggle && onToggle(item)}
            style={{ width: 26, height: 26, borderRadius: 9, border: `2px solid ${item.paid ? "#16A34A" : "#D1D5DB"}`, background: item.paid ? "#16A34A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}
          >
            {item.paid && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: item.paid ? "#16A34A" : "#1E3A5F", textDecoration: item.paid ? "line-through" : "none", opacity: item.paid ? 0.75 : 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.emoji} {item.name}
              {item.source === "debt" && (
                <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: "#FEE2E2", color: "#DC2626", padding: "2px 6px", borderRadius: 99, verticalAlign: "middle" }}>dette</span>
              )}
            </p>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "#8896B0", marginTop: 1 }}>{fmt(item.amount)}</p>
          </div>
          {item.source === "recurring" && (
            <button onClick={() => onDeleteRecurring && onDeleteRecurring(item.id)} style={{ width: 28, height: 28, borderRadius: 9, background: "#F1F3F9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#8896B0" }}>
              <span style={{ fontSize: 12 }}>✕</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Income List ──────────────────────────────────────────────────────────────
function IncomeList({ incomes, onDelete, onAdd }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {incomes.length === 0 && (
        <p style={{ fontSize: 13, color: "#8896B0", textAlign: "center", padding: "12px 0" }}>Aucun revenu saisi</p>
      )}
      {incomes.map((inc) => (
        <div key={inc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F1F3F9" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#1E3A5F" }}>{inc.label}</p>
            <p style={{ fontSize: 11, color: "#8896B0" }}>{inc.isFixed ? "Fixe" : "Variable"}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#16A34A" }}>+{fmt(inc.amount)}</span>
            <button
              onClick={() => onDelete && onDelete(inc.id)}
              style={{ width: 28, height: 28, borderRadius: 9, background: "#F1F3F9", border: "none", cursor: "pointer", color: "#8896B0", display: "flex", alignItems: "center", justifyContent: "center" }}
            >✕</button>
          </div>
        </div>
      ))}
      <button
        onClick={onAdd}
        style={{ marginTop: 10, width: "100%", padding: "11px", background: "#EFF6FF", color: "#2563EB", border: "none", borderRadius: 14, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
      >
        + Ajouter un revenu
      </button>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #E8EDF5", borderRadius: 12, padding: "8px 12px", fontSize: 12 }}>
      <p style={{ fontWeight: 700, color: "#1E3A5F", marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color, fontFamily: "monospace" }}>{p.name} : {fmt(p.value)}</p>
      ))}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function BilanDashboard({ transactions = [] }) {
  const [incomes, setIncomes] = useState(MOCK_INCOMES);
  const [checklist, setChecklist] = useState(MOCK_CHECKLIST);
  const [savings] = useState(MOCK_SAVINGS);
  const [debts] = useState(MOCK_DEBTS);
  const plan = MOCK_PLAN;
  const projection = MOCK_PROJECTION;

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalSavings = savings.reduce((s, g) => s + g.saved, 0);
  const totalDebt = debts.filter((d) => d.type === "owe").reduce((s, d) => s + d.remaining, 0);
  const netWorth = totalSavings + 12000 - totalDebt;
  const cashflow = plan.freeMoney;
  const endBalance = projection[projection.length - 1]?.projectedBalance ?? 0;

  const tip = plan.alerts?.[0] ?? `💰 Tu peux épargner ${fmt(plan.savingsSuggestion)} ce mois tout en remboursant ${fmt(plan.snowballSuggestion)} de dettes.`;

  function toggleItem(item) {
    setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, paid: !c.paid } : c)));
  }

  const currentYM = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 420, margin: "0 auto", padding: "16px 14px 40px", background: "#F4F6FB", minHeight: "100vh", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ① Coach IA */}
      <CoachBanner message={`"${tip}"`} />

      {/* ② KPI 2×2 */}
      <div>
        <SectionLabel>② KPI Principaux</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <KpiCard label="Patrimoine net" value={fmt(netWorth)} color="#7C3AED" bg="#F5F3FF" icon="💎" />
          <KpiCard label="Dette totale" value={fmt(totalDebt)} color="#DC2626" bg="#FEF2F2" icon="💳" />
          <KpiCard label="Épargne totale" value={fmt(totalSavings)} color="#16A34A" bg="#F0FDF4" icon="🐖" />
          <KpiCard label="Cashflow du mois" value={fmt(cashflow)} color="#2563EB" bg="#EFF6FF" icon="📈" />
        </div>
      </div>

      {/* ③ Évolution du patrimoine */}
      <Card>
        <SectionLabel>③ Évolution du patrimoine</SectionLabel>
        <p style={{ fontSize: 24, fontWeight: 800, fontFamily: "monospace", color: endBalance >= 0 ? "#16A34A" : "#DC2626", marginBottom: 2 }}>{fmt(endBalance)}</p>
        <p style={{ fontSize: 11, color: "#8896B0", marginBottom: 14 }}>solde projeté en décembre {NOW.getFullYear()}</p>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={projection} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8896B0" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#8896B0" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="#DC2626" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="projectedBalance" stroke="#7C3AED" strokeWidth={2.5} fill="url(#patGrad)" name="Patrimoine net" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ④ Compte de résultat */}
      <Card>
        <SectionLabel>④ Compte de résultat</SectionLabel>
        <IncomeStatement plan={plan} />
      </Card>

      {/* ⑤ Revenus vs Dépenses — 6 mois */}
      <Card>
        <SectionLabel>⑤ Revenus vs Dépenses — 6 mois</SectionLabel>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={MOCK_6M} barGap={4} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F9" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8896B0" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#8896B0" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="Revenus" fill="#16A34A" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Dépenses" fill="#DC2626" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
          {[{ color: "#16A34A", label: "Revenus" }, { color: "#DC2626", label: "Dépenses" }].map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
              <span style={{ fontSize: 11, color: "#8896B0" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ⑥ Bilan patrimonial */}
      <Card>
        <SectionLabel>⑥ Bilan patrimonial</SectionLabel>
        <BalanceSheet savings={savings} debts={debts} />
      </Card>

      {/* ⑦ Santé financière */}
      <Card>
        <SectionLabel>⑦ Santé financière</SectionLabel>
        <HealthGauge score={84} />
      </Card>

      {/* ⑧ Paiements du mois */}
      <Card>
        <SectionLabel>⑧ Paiements du mois</SectionLabel>
        <ChecklistSection checklist={checklist} onToggle={toggleItem} />
      </Card>

      {/* ⑨ Revenus du mois */}
      <Card>
        <SectionLabel>⑨ Revenus du mois</SectionLabel>
        <IncomeList
          incomes={incomes}
          onDelete={(id) => setIncomes((prev) => prev.filter((i) => i.id !== id))}
          onAdd={() => {}}
        />
      </Card>

    </div>
  );
}
