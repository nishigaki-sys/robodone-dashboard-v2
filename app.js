import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, AlertCircle, MapPin, Settings, Plus, Trash2, School, Database, Wifi, FileText, Save, RefreshCw, Sun, Cloud, CloudRain, Snowflake, PenTool, ChevronDown, ChevronRight, Building, X, Ban, Upload } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";

// ==========================================
// ★ Firebase設定
// ==========================================
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
const CACHE_KEYS = {
    CAMPUSES: 'dash_campuses', ENROLLMENTS: 'dash_enrollments', STATUS: 'dash_status',
    TRANSFERS: 'dash_transfers', DAILY_REPORTS: 'dash_daily_reports', TRIAL_APPS: 'dash_trial_apps', 
    FINANCES: 'dash_finances', LAST_UPDATED: 'dash_last_updated'
};

// ★ 収支の分類定義 
const ACCOUNT_CLASSIFICATION = {
    'revenue': ['A51', '5100'], 
    'labor': ['A63', '6300'],   
    'selling': ['A61', 'A62', '6100', '6200'], 
    'facility': ['A64', '6400'], 
    'admin': ['A65', '6500']    
};

// Firebase Init
let db = null;
let isFirebaseInitialized = false;
try {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    isFirebaseInitialized = true;
} catch (e) { console.error("Firebase Init Error:", e); }

// ==========================================
// Helper Functions 
// ==========================================
const normalizeString = (str) => (!str ? "" : str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
const parseDate = (dateValue) => {
    if (!dateValue) return null;
    if (typeof dateValue.toDate === 'function') return dateValue.toDate();
    if (dateValue.seconds) return new Date(dateValue.seconds * 1000);
    const d = new Date(dateValue);
    return isNaN(d.getTime()) ? null : d;
};
const formatDateStr = (date) => `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;
const getFiscalYear = (date) => (date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear());
const formatYen = (val) => `¥${Math.round(val || 0).toLocaleString()}`;

const getWeeksStruct = (fiscalYear, monthIndex) => {
    let targetYear = fiscalYear;
    let jsMonth = monthIndex + 3;
    if (jsMonth > 11) { jsMonth -= 12; targetYear += 1; }
    const daysInMonth = new Date(targetYear, jsMonth + 1, 0).getDate();
    const weeks = [];
    let startDay = 1;
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(targetYear, jsMonth, day);
        if (dateObj.getDay() === 0 || day === daysInMonth) {
            weeks.push({ name: `第${weeks.length + 1}週 (${startDay}日～${day}日)`, startDay, endDay: day });
            startDay = day + 1;
        }
    }
    return { weeks, daysInMonth, targetYear, jsMonth };
};

// ==========================================
// UI Components 
// ==========================================
const StatCard = ({ title, value, subValue, trend, icon: Icon, color, details }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${color}`}><Icon className="w-6 h-6 text-white" /></div>
        </div>
        <div className="mt-4 flex items-center text-sm text-slate-400">
            {subValue}
        </div>
        {details && details.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
                {details.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-500">
                        <span>{item.label}</span><span className="font-medium text-slate-700">{item.value}</span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

// ==========================================
// Main Component
// ==========================================
function RobotSchoolDashboard() {
    const today = new Date();
    const currentFiscalYear = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    const currentMonthStr = `${today.getMonth() + 1}月`;

    const [activeTab, setActiveTab] = useState('summary');
    const [selectedCampusId, setSelectedCampusId] = useState('All');
    const [selectedYear, setSelectedYear] = useState(currentFiscalYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [viewMode, setViewMode] = useState('monthly');
    const [isCampusMenuOpen, setIsCampusMenuOpen] = useState(true);
    const [expandedCampusId, setExpandedCampusId] = useState(null);

    const [campusList, setCampusList] = useState([]);
    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);
    const [realDailyReports, setRealDailyReports] = useState([]);
    const [realTrialApps, setRealTrialApps] = useState([]); 
    const [realFinances, setRealFinances] = useState([]); // ★追加 

    const [rawDataMap, setRawDataMap] = useState(null);
    const [displayData, setDisplayData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    // 日報モーダル用
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);
    const [reportDate, setReportDate] = useState("");
    const [dailyReportInput, setDailyReportInput] = useState({ weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });

    const selectedCampusName = useMemo(() => {
        if (selectedCampusId === 'All') return '全校舎 (合計)';
        return campusList.find(c => c.id === selectedCampusId)?.name || selectedCampusId;
    }, [selectedCampusId, campusList]);

    // データ同期処理 
    const fetchFromFirebase = async () => {
        if (!db) return;
        setIsSyncing(true);
        try {
            const [campusSnap, enrollSnap, statusSnap, transferSnap, reportSnap, trialSnap, financeSnap] = await Promise.all([
                getDocs(query(collection(db, "campuses"), orderBy("createdAt"))),
                getDocs(collection(db, "enrollments")),
                getDocs(collection(db, "status_changes")),
                getDocs(collection(db, "transfers")),
                getDocs(collection(db, "daily_reports")),
                getDocs(collection(db, "trial_applications")),
                getDocs(collection(db, "campus_finances")) // ★追加
            ]);

            setCampusList(campusSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setRealEnrollments(enrollSnap.docs.map(d => d.data()));
            setRealStatusChanges(statusSnap.docs.map(d => d.data()));
            setRealTransfers(transferSnap.docs.map(d => d.data()));
            setRealDailyReports(reportSnap.docs.map(d => d.data()));
            setRealTrialApps(trialSnap.docs.map(d => d.data()));
            setRealFinances(financeSnap.docs.map(d => d.data()));
            setLastUpdated(new Date());
        } catch (e) { console.error("Sync error", e); } finally { setIsSyncing(false); setIsLoading(false); }
    };

    useEffect(() => { fetchFromFirebase(); }, []);

    // CSVアップロード処理 
    const handleCSVUpload = async (e, campusId) => {
        const file = e.target.files[0];
        if (!file || !campusId) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target.result;
            const lines = text.split(/\r?\n/);
            const monthlyData = {};
            MONTHS_LIST.forEach(m => { monthlyData[m] = { revenue: 0, labor: 0, selling: 0, facility: 0, admin: 0 }; });

            lines.slice(1).forEach(line => {
                const cols = line.split(',');
                if (cols.length < 15) return;
                const code = cols[0].trim();
                let category = null;
                for (const [key, prefixes] of Object.entries(ACCOUNT_CLASSIFICATION)) {
                    if (prefixes.some(p => code.startsWith(p) && code.length <= 5)) { category = key; break; }
                }
                if (category) {
                    MONTHS_LIST.forEach((month, idx) => {
                        let val = Math.abs(parseFloat(cols[idx + 2]) || 0);
                        monthlyData[month][category] += val;
                    });
                }
            });
            await setDoc(doc(db, "campus_finances", `${campusId}_${selectedYear}`), { campusId, year: selectedYear, monthlyData, updatedAt: serverTimestamp() });
            alert("収支データを保存しました。");
            fetchFromFirebase();
        };
        reader.readAsText(file);
    };

    // ★ 統合集計コアロジック 
    const generateAllCampusesData = () => {
        if (!campusList.length) return;
        const dataMap = {};
        
        const getResolvedCampusId = (rawName) => {
            const normInput = normalizeString(rawName);
            return campusList.find(c => {
                const normCName = normalizeString(c.name);
                return normInput.includes(normCName) || normCName.includes(normInput);
            })?.id;
        };

        campusList.forEach(campusObj => {
            const cid = campusObj.id;
            const myFinance = realFinances.find(f => f.campusId === cid && f.year === selectedYear);
            let currentStudents = 0; // 年度開始前の生徒数は一旦0（本来は前年度データから計算）

            dataMap[cid] = MONTHS_LIST.map((month, mIdx) => {
                const finance = myFinance?.monthlyData?.[month] || { revenue: 0, labor: 0, selling: 0, facility: 0, admin: 0 };
                
                // 生徒増減計算 
                const mEnroll = realEnrollments.filter(e => {
                    const d = parseDate(e.date);
                    return d && getFiscalYear(d) === selectedYear && (d.getMonth() + 9) % 12 === mIdx && getResolvedCampusId(e.campus) === cid;
                }).length;

                const mWithdraw = realStatusChanges.filter(s => {
                    const d = parseDate(s.date);
                    return d && getFiscalYear(d) === selectedYear && (d.getMonth() + 9) % 12 === mIdx && getResolvedCampusId(s.campus) === cid && (s.type?.includes("退会") || s.type?.includes("卒業"));
                }).length;

                const mTransferIn = realTransfers.filter(t => {
                    const d = parseDate(t.date);
                    return d && getFiscalYear(d) === selectedYear && (d.getMonth() + 9) % 12 === mIdx && getResolvedCampusId(t.campus) === cid;
                }).length;

                currentStudents += (mEnroll + mTransferIn - mWithdraw);

                // 日次・週次の入れ物 
                const { weeks, daysInMonth, targetYear: tYear, jsMonth: tMonth } = getWeeksStruct(selectedYear, mIdx);
                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const dayNum = dIdx + 1;
                    const dateStr = `${tYear}-${('0'+(tMonth+1)).slice(-2)}-${('0'+dayNum).slice(-2)}`;
                    const report = realDailyReports.find(r => r.campusId === cid && r.date === dateStr) || {};
                    const trials = realTrialApps.filter(app => getResolvedCampusId(app.campus) === cid && parseDate(app.trialDate) && formatDateStr(parseDate(app.trialDate)) === dateStr).length;

                    return {
                        name: `${dayNum}日`,
                        actualRevenue: 0, // 日次の売上データはCSVにないため0
                        newEnrollments: 0, // 簡易化のため月次集計のみに反映
                        flyers: report.flyers || 0,
                        touchAndTry: report.touchTry || 0,
                        trialExec: trials
                    };
                });

                return {
                    name: month,
                    actualRevenue: finance.revenue,
                    actualExpense: finance.labor + finance.selling + finance.facility + finance.admin,
                    labor: finance.labor, selling: finance.selling, // 詳細用
                    newEnrollments: mEnroll,
                    transferIns: mTransferIn,
                    withdrawals: mWithdraw,
                    totalStudents: currentStudents,
                    withdrawals_neg: -mWithdraw,
                    flyers: daily.reduce((sum, d) => sum + d.flyers, 0),
                    trialExec: daily.reduce((sum, d) => sum + d.trialExec, 0),
                    daily,
                    weekly: weeks.map(w => ({ name: w.name, trialExec: 0, newEnrollments: 0 })) 
                };
            });
        });

        // 合計計算
        dataMap['All'] = MONTHS_LIST.map((month, idx) => {
            const res = { name: month, actualRevenue: 0, actualExpense: 0, newEnrollments: 0, withdrawals: 0, totalStudents: 0, withdrawals_neg: 0, flyers: 0, trialExec: 0, daily: [], weekly: [] };
            campusList.forEach(c => {
                const d = dataMap[c.id][idx];
                Object.keys(res).forEach(k => { if (typeof res[k] === 'number') res[k] += d[k]; });
            });
            return res;
        });

        setRawDataMap(dataMap);
    };

    useEffect(() => { generateAllCampusesData(); }, [campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, realFinances, selectedYear]);

    useEffect(() => {
        if (rawDataMap) {
            const campusData = rawDataMap[selectedCampusId] || [];
            if (viewMode === 'annual') { setDisplayData(campusData); }
            else {
                const targetMonthData = campusData.find(d => d.name === selectedMonth);
                setDisplayData(targetMonthData ? (viewMode === 'monthly' ? targetMonthData.daily : targetMonthData.weekly) : []);
            }
        }
    }, [selectedCampusId, viewMode, selectedMonth, rawDataMap]);

    const totals = useMemo(() => {
        return (displayData || []).reduce((acc, curr) => ({
            revenue: acc.revenue + (curr.actualRevenue || 0),
            expense: acc.expense + (curr.actualExpense || 0),
            enroll: acc.enroll + (curr.newEnrollments || 0),
            withdraw: acc.withdraw + (curr.withdrawals || 0),
            trials: acc.trials + (curr.trialExec || 0)
        }), { revenue: 0, expense: 0, enroll: 0, withdraw: 0, trials: 0 });
    }, [displayData]);

    // 日報カレンダーのレンダリング 
    const renderCalendar = () => {
        const mIdx = MONTHS_LIST.indexOf(selectedMonth);
        const { daysInMonth, targetYear, jsMonth } = getWeeksStruct(selectedYear, mIdx);
        const firstDay = new Date(targetYear, jsMonth, 1).getDay();
        const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`b-${i}`} className="h-24 bg-slate-50 border border-slate-100"></div>);
        const days = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${targetYear}-${('0'+(jsMonth+1)).slice(-2)}-${('0'+day).slice(-2)}`;
            const report = realDailyReports.find(r => r.campusId === selectedCampusId && r.date === dateStr);
            return (
                <div key={day} onClick={() => { setReportDate(dateStr); setIsInputModalOpen(true); }} className="h-24 border border-slate-200 p-2 cursor-pointer hover:bg-blue-50 transition-colors bg-white">
                    <span className="text-sm font-bold text-slate-700">{day}</span>
                    {report && <div className="mt-1 text-[10px] bg-blue-100 text-blue-700 p-1 rounded">門配: {report.flyers}</div>}
                </div>
            );
        });
        return [...blanks, ...days];
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans">
            {/* Sidebar  */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 overflow-y-auto">
                <div className="p-6 border-b border-slate-800 font-bold text-xl">RobotSchoolDash</div>
                <nav className="flex-1 p-4 space-y-2">
                    <button onClick={() => setActiveTab('summary')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'summary' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><LayoutDashboard /><span>経営サマリー</span></button>
                    <button onClick={() => setActiveTab('students')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'students' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Users /><span>生徒管理</span></button>
                    <button onClick={() => setActiveTab('marketing')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'marketing' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Megaphone /><span>集客・販促</span></button>
                    <button onClick={() => setActiveTab('daily')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'daily' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Calendar /><span>日報カレンダー</span></button>
                    <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings /><span>校舎・CSV設定</span></button>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b flex items-center justify-between px-6 shrink-0">
                    <h1 className="text-lg font-bold">{selectedCampusName}</h1>
                    <div className="flex items-center space-x-4">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-slate-100 border-none rounded p-1 text-sm">{YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}</select>
                        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-slate-100 border-none rounded p-1 text-sm">{MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}</select>
                        <select value={selectedCampusId} onChange={e => setSelectedCampusId(e.target.value)} className="bg-slate-100 border-none rounded p-1 text-sm"><option value="All">全校舎合計</option>{campusList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <button onClick={fetchFromFirebase} className="p-2 hover:bg-slate-100 rounded"><RefreshCw className={isSyncing ? "animate-spin" : ""} /></button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* 経営サマリータブ  */}
                    {activeTab === 'summary' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatCard title="売上実績" value={formatYen(totals.revenue)} icon={DollarSign} color="bg-blue-500" subValue="選択期間" />
                                <StatCard title="営業利益" value={formatYen(totals.revenue - totals.expense)} icon={TrendingUp} color="bg-emerald-500" subValue="粗利推測" />
                                <StatCard title="現在の生徒数" value={`${rawDataMap?.[selectedCampusId]?.[MONTHS_LIST.indexOf(selectedMonth)]?.totalStudents || 0}名`} icon={Users} color="bg-indigo-500" subValue="末日時点" />
                                <StatCard title="体験会実施" value={`${totals.trials}件`} icon={Calendar} color="bg-amber-500" subValue="実施ベース" />
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border h-[400px]">
                                <h3 className="font-bold mb-4">収支と生徒数の推移</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={rawDataMap?.[selectedCampusId] || []}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis yAxisId="left" />
                                        <YAxis yAxisId="right" orientation="right" />
                                        <Tooltip formatter={v => v.toLocaleString()} />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="actualRevenue" name="売上" fill="#3b82f6" />
                                        <Bar yAxisId="left" dataKey="actualExpense" name="経費" fill="#f43f5e" />
                                        <Line yAxisId="right" type="monotone" dataKey="totalStudents" name="生徒数" stroke="#6366f1" strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}

                    {/* 日報カレンダー  */}
                    {activeTab === 'daily' && (
                        <div className="bg-white p-6 rounded-xl border">
                            <h3 className="font-bold mb-4">{selectedMonth} 日報状況</h3>
                            <div className="grid grid-cols-7 gap-px bg-slate-200 border rounded-lg overflow-hidden">
                                {['日','月','火','水','木','金','土'].map(d => <div key={d} className="p-2 text-center text-xs font-bold bg-slate-50 text-slate-500">{d}</div>)}
                                {renderCalendar()}
                            </div>
                        </div>
                    )}

                    {/* 校舎・CSV設定タブ  */}
                    {activeTab === 'settings' && (
                        <div className="space-y-6">
                            <div className="bg-white p-8 rounded-xl border">
                                <h3 className="font-bold text-lg mb-6 flex items-center"><Upload className="mr-2" />収支データCSV連携</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {campusList.map(c => (
                                        <div key={c.id} className="p-4 border rounded-lg flex items-center justify-between bg-slate-50">
                                            <div>
                                                <div className="font-bold">{c.name}</div>
                                                <div className="text-xs text-slate-500">ID: {c.id}</div>
                                            </div>
                                            <label className="bg-white border px-3 py-1 text-sm rounded cursor-pointer hover:bg-blue-50">
                                                CSVを選択
                                                <input type="file" className="hidden" accept=".csv" onChange={(e) => handleCSVUpload(e, c.id)} />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<RobotSchoolDashboard />);
