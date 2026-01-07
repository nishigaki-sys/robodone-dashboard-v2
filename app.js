import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, AlertCircle, MapPin, Settings, Plus, Trash2, School, Database, Wifi, FileText, Save, RefreshCw, Sun, Cloud, CloudRain, Snowflake, PenTool, ChevronDown, ChevronRight, Building, X, Ban, Tag } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

// --- 設定値 ---
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCsgMN0SWCC1SvCDIakYBejTWlxwBmiwJk",
    authDomain: "robodone-dashboard.firebaseapp.com",
    projectId: "robodone-dashboard",
    storageBucket: "robodone-dashboard.firebasestorage.app",
    messagingSenderId: "457095919160",
    appId: "1:457095919160:web:1716af87290b63733598cd"
};

const MONTHS_LIST = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月'];
const YEARS_LIST = [2022, 2023, 2024, 2025, 2026];
const CACHE_KEYS = { CAMPUSES: 'dash_campuses', ENROLLMENTS: 'dash_enrollments', STATUS: 'dash_status', TRANSFERS: 'dash_transfers', DAILY_REPORTS: 'dash_daily_reports', TRIAL_APPS: 'dash_trial_apps', LAST_UPDATED: 'dash_last_updated' };

let db = null;
let isFirebaseInitialized = false;
try {
    if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_API_KEY") {
        const app = initializeApp(FIREBASE_CONFIG);
        db = getFirestore(app);
        isFirebaseInitialized = true;
    }
} catch (e) { console.error("Firebase Init Error:", e); }

// --- ユーティリティ ---
const normalizeString = (str) => (!str ? "" : str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toLowerCase());
const parseDate = (v) => {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v.seconds) return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};
const formatDateStr = (d) => `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}-${('0'+d.getDate()).slice(-2)}`;
const getFiscalYear = (d) => (!d ? -1 : (d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear()));
const getWeeksStruct = (fy, mi) => {
    let y = fy, m = mi + 3; if (m > 11) { m -= 12; y += 1; }
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const weeks = []; let startDay = 1;
    for (let d = 1; d <= daysInMonth; d++) {
        if (new Date(y, m, d).getDay() === 0 || d === daysInMonth) {
            weeks.push({ name: `第${weeks.length + 1}週 (${startDay}-${d})`, startDay, endDay: d });
            startDay = d + 1;
        }
    }
    return { weeks, daysInMonth, targetYear: y, jsMonth: m };
};

// --- コンポーネント ---
const StatCard = ({ title, value, subValue, trend, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex justify-between items-start">
            <div><p className="text-sm font-medium text-slate-500 mb-1">{title}</p><h3 className="text-2xl font-bold text-slate-800">{value}</h3></div>
            <div className={`p-3 rounded-lg ${color}`}><Icon className="w-6 h-6 text-white" /></div>
        </div>
        <div className="mt-4 text-xs text-slate-400">{subValue}</div>
    </div>
);

function RobotSchoolDashboard() {
    const [activeTab, setActiveTab] = useState('summary');
    const [selectedCampusId, setSelectedCampusId] = useState('All');
    const [viewMode, setViewMode] = useState('monthly');
    const [selectedMonth, setSelectedMonth] = useState(`${new Date().getMonth() + 1}月`);
    const [selectedYear, setSelectedYear] = useState(new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear());
    const [campusList, setCampusList] = useState([]);
    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);
    const [realDailyReports, setRealDailyReports] = useState([]);
    const [realTrialApps, setRealTrialApps] = useState([]);
    const [rawDataMap, setRawDataMap] = useState(null);
    const [displayData, setDisplayData] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);
    const [reportDate, setReportDate] = useState(formatDateStr(new Date()));
    const [dailyReportInput, setDailyReportInput] = useState({ flyers: 0, trialLessons: 0 });

    const fetchData = async () => {
        if (!db) return; setIsSyncing(true);
        try {
            const [c, e, s, t, r, tr] = await Promise.all([
                getDocs(query(collection(db, "campuses"), orderBy("createdAt"))),
                getDocs(collection(db, "enrollments")),
                getDocs(collection(db, "status_changes")),
                getDocs(collection(db, "transfers")),
                getDocs(collection(db, "daily_reports")),
                getDocs(collection(db, "trial_applications"))
            ]);
            setCampusList(c.docs.map(d => ({ id: d.id, ...d.data(), aliases: d.data().aliases || [] })));
            setRealEnrollments(e.docs.map(d => d.data()));
            setRealStatusChanges(s.docs.map(d => d.data()));
            setRealTransfers(t.docs.map(d => d.data()));
            setRealDailyReports(r.docs.map(d => d.data()));
            setRealTrialApps(tr.docs.map(d => d.data()));
        } finally { setIsSyncing(false); }
    };

    useEffect(() => { fetchData(); }, []);

    // --- 集計ロジック ---
    useEffect(() => {
        if (campusList.length === 0) return;
        const idLookup = {};
        campusList.forEach(c => {
            idLookup[normalizeString(c.id)] = c.id; idLookup[normalizeString(c.name)] = c.id;
            (c.aliases || []).forEach(a => idLookup[normalizeString(a)] = c.id);
        });
        const getCid = (n) => idLookup[normalizeString(n)] || null;

        const dataMap = {};
        campusList.forEach(campus => {
            const cid = campus.id;
            let currentStudents = 0; // 簡易化のため0開始
            dataMap[cid] = MONTHS_LIST.map((month, mi) => {
                const { weeks, daysInMonth, targetYear, jsMonth } = getWeeksStruct(selectedYear, mi);
                const daily = Array.from({ length: daysInMonth }, (_, di) => {
                    const day = di + 1;
                    const dateStr = `${targetYear}-${('0'+(jsMonth+1)).slice(-2)}-${('0'+day).slice(-2)}`;
                    const rep = realDailyReports.find(r => r.campusId === cid && r.date === dateStr) || {};
                    const trial = realTrialApps.filter(a => getCid(a.campus) === cid && formatDateStr(parseDate(a.trialDate)) === dateStr).length;
                    const app = realTrialApps.filter(a => getCid(a.campus) === cid && formatDateStr(parseDate(a.date)) === dateStr).length;
                    const enr = realEnrollments.filter(e => getCid(e.campus) === cid && formatDateStr(parseDate(e.date)) === dateStr).length;
                    const wth = realStatusChanges.filter(s => getCid(s.campus) === cid && s.type === "退会" && formatDateStr(parseDate(s.date)) === dateStr).length;
                    return { name: `${day}日`, newEnrollments: enr, withdrawals: wth, trialApp: app, trialExec: trial, trialLessons: rep.trialLessons || 0, flyers: rep.flyers || 0, withdrawals_neg: -wth };
                });
                const mData = {
                    name: month, daily, 
                    newEnrollments: daily.reduce((a, b) => a + b.newEnrollments, 0),
                    withdrawals: daily.reduce((a, b) => a + b.withdrawals, 0),
                    trialApp: daily.reduce((a, b) => a + b.trialApp, 0),
                    trialExec: daily.reduce((a, b) => a + b.trialExec, 0),
                    trialLessons: daily.reduce((a, b) => a + b.trialLessons, 0),
                    flyers: daily.reduce((a, b) => a + b.flyers, 0),
                    weekly: weeks.map(w => {
                        const slice = daily.slice(w.startDay - 1, w.endDay);
                        return { name: w.name, newEnrollments: slice.reduce((a, b) => a + b.newEnrollments, 0), trialApp: slice.reduce((a, b) => a + b.trialApp, 0), trialExec: slice.reduce((a, b) => a + b.trialExec, 0), trialLessons: slice.reduce((a, b) => a + b.trialLessons, 0), flyers: slice.reduce((a, b) => a + b.flyers, 0) };
                    })
                };
                currentStudents += (mData.newEnrollments - mData.withdrawals);
                mData.totalStudents = currentStudents; mData.withdrawals_neg = -mData.withdrawals;
                return mData;
            });
        });

        // 全校舎(All)の合算処理
        dataMap['All'] = MONTHS_LIST.map((month, mi) => {
            const { weeks, daysInMonth } = getWeeksStruct(selectedYear, mi);
            const combined = { 
                name: month, newEnrollments: 0, withdrawals: 0, totalStudents: 0, flyers: 0, trialLessons: 0, trialApp: 0, trialExec: 0, withdrawals_neg: 0,
                daily: Array.from({ length: daysInMonth }, (_, di) => ({ name: `${di + 1}日`, newEnrollments: 0, withdrawals: 0, trialApp: 0, trialExec: 0, trialLessons: 0, flyers: 0, withdrawals_neg: 0 })),
                weekly: weeks.map(w => ({ name: w.name, newEnrollments: 0, trialApp: 0, trialExec: 0, trialLessons: 0, flyers: 0 }))
            };
            campusList.forEach(c => {
                const d = dataMap[c.id][mi];
                combined.newEnrollments += d.newEnrollments; combined.withdrawals += d.withdrawals; combined.totalStudents += d.totalStudents;
                combined.flyers += d.flyers; combined.trialLessons += d.trialLessons; combined.trialApp += d.trialApp; combined.trialExec += d.trialExec;
                d.daily.forEach((day, di) => {
                    const target = combined.daily[di];
                    target.newEnrollments += day.newEnrollments; target.withdrawals += day.withdrawals; target.trialApp += day.trialApp; 
                    target.trialExec += day.trialExec; target.trialLessons += day.trialLessons; target.flyers += day.flyers; target.withdrawals_neg -= day.withdrawals;
                });
                d.weekly.forEach((wk, wi) => {
                    const target = combined.weekly[wi];
                    target.newEnrollments += wk.newEnrollments; target.trialApp += wk.trialApp; target.trialExec += wk.trialExec; target.trialLessons += wk.trialLessons; target.flyers += wk.flyers;
                });
            });
            combined.withdrawals_neg = -combined.withdrawals;
            return combined;
        });
        setRawDataMap(dataMap);
    }, [campusList, realEnrollments, realStatusChanges, realDailyReports, realTrialApps, selectedYear]);

    // 表示データの抽出
    useEffect(() => {
        if (!rawDataMap) return;
        const campusData = rawDataMap[selectedCampusId] || [];
        if (viewMode === 'annual') setDisplayData(campusData);
        else {
            const m = campusData.find(d => d.name === selectedMonth);
            setDisplayData(m ? (viewMode === 'monthly' ? m.daily : m.weekly) : []);
        }
    }, [selectedCampusId, viewMode, selectedMonth, rawDataMap]);

    // 集計カード用データ
    const totals = useMemo(() => {
        const init = { newEnrollments: 0, trialLessons: 0, trialApp: 0, trialExec: 0, totalStudents: 0 };
        if (!displayData || displayData.length === 0) return init; // 安全性チェック
        const res = displayData.reduce((acc, curr) => ({
            newEnrollments: acc.newEnrollments + (curr.newEnrollments || 0),
            trialLessons: acc.trialLessons + (curr.trialLessons || 0),
            trialApp: acc.trialApp + (curr.trialApp || 0),
            trialExec: acc.trialExec + (curr.trialExec || 0),
            totalStudents: curr.totalStudents || acc.totalStudents // 最後の値を採用
        }), init);
        return res;
    }, [displayData]);

    const handleSaveReport = async () => {
        if (selectedCampusId === 'All' || !db) return;
        await setDoc(doc(db, "daily_reports", `${selectedCampusId}_${reportDate}`), { campusId: selectedCampusId, date: reportDate, ...dailyReportInput });
        setIsInputModalOpen(false); fetchData();
    };

    return (
        <div className="min-h-screen bg-slate-50 flex text-slate-900">
            <aside className="w-64 bg-slate-900 text-white p-6 space-y-4">
                <div className="font-bold text-xl flex items-center gap-2"><TrendingUp className="text-blue-400" /> RoboDash</div>
                <nav className="space-y-1">
                    <button onClick={() => setActiveTab('summary')} className={`w-full text-left p-3 rounded-lg ${activeTab==='summary'?'bg-blue-600':'hover:bg-slate-800'}`}>サマリー</button>
                    <button onClick={() => setActiveTab('marketing')} className={`w-full text-left p-3 rounded-lg ${activeTab==='marketing'?'bg-blue-600':'hover:bg-slate-800'}`}>マーケティング</button>
                </nav>
            </aside>
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="h-16 bg-white border-b px-6 flex items-center justify-between">
                    <div className="font-bold">{selectedCampusId === 'All' ? '全校舎' : campusList.find(c=>c.id===selectedCampusId)?.name}</div>
                    <div className="flex gap-2">
                        <select value={selectedCampusId} onChange={e=>setSelectedCampusId(e.target.value)} className="text-sm border rounded p-1"><option value="All">全校舎</option>{campusList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <select value={viewMode} onChange={e=>setViewMode(e.target.value)} className="text-sm border rounded p-1"><option value="annual">年度</option><option value="monthly">月度</option><option value="weekly">週次</option></select>
                        {viewMode !== 'annual' && <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="text-sm border rounded p-1">{MONTHS_LIST.map(m=><option key={m} value={m}>{m}</option>)}</select>}
                        <button onClick={()=>{setSelectedCampusId(campusList[0]?.id); setIsInputModalOpen(true);}} className="p-2 bg-blue-600 text-white rounded text-sm"><PenTool size={16}/></button>
                    </div>
                </header>
                <div className="p-6 overflow-y-auto space-y-6">
                    {activeTab === 'summary' && (
                        <>
                            <div className="grid grid-cols-4 gap-6">
                                <StatCard title="生徒数" value={`${totals.totalStudents}名`} subValue="現在" icon={Users} color="bg-indigo-500" />
                                <StatCard title="入会数" value={`${totals.newEnrollments}名`} subValue="期間累計" icon={Activity} color="bg-emerald-500" />
                                <StatCard title="体験実施" value={`${totals.trialLessons}回`} subValue="日報実績" icon={Calendar} color="bg-amber-500" />
                                <StatCard title="体験予約" value={`${totals.trialExec}件`} subValue="システム" icon={Wifi} color="bg-blue-500" />
                            </div>
                            <div className="bg-white p-6 rounded-xl border h-96">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={displayData} stackOffset="sign">
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis /><Tooltip /><Legend />
                                        <Bar dataKey="newEnrollments" name="入会" fill="#10b981" stackId="s" />
                                        <Bar dataKey="withdrawals_neg" name="退会" fill="#ef4444" stackId="s" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}
                    {activeTab === 'marketing' && (
                        <div className="bg-white p-6 rounded-xl border h-[500px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={displayData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
                                    <Bar dataKey="trialApp" name="予約件数" fill="#93c5fd" />
                                    <Bar dataKey="trialExec" name="実行件数" fill="#3b82f6" />
                                    <Line type="monotone" dataKey="trialLessons" name="日報実施数" stroke="#f59e0b" strokeWidth={3} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {isInputModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-xl w-80 space-y-4">
                            <h3 className="font-bold">日報入力</h3>
                            <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} className="w-full border p-2 rounded" />
                            <input type="number" placeholder="体験実施数" value={dailyReportInput.trialLessons} onChange={e=>setDailyReportInput({...dailyReportInput, trialLessons:Number(e.target.value)})} className="w-full border p-2 rounded" />
                            <input type="number" placeholder="門配枚数" value={dailyReportInput.flyers} onChange={e=>setDailyReportInput({...dailyReportInput, flyers:Number(e.target.value)})} className="w-full border p-2 rounded" />
                            <div className="flex gap-2"><button onClick={()=>setIsInputModalOpen(false)} className="flex-1 p-2 bg-slate-100 rounded">閉じる</button><button onClick={handleSaveReport} className="flex-1 p-2 bg-blue-600 text-white rounded">保存</button></div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<RobotSchoolDashboard />);
