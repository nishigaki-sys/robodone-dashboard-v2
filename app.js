import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, AlertCircle, MapPin, Settings, Plus, Trash2, School, Database, FileText, Save, RefreshCw, Sun, Cloud, CloudRain, Snowflake, PenTool, ChevronDown, ChevronRight, Building, X, Ban } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";

// --- Firebase設定 ---
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
    if (FIREBASE_CONFIG.apiKey) {
        const app = initializeApp(FIREBASE_CONFIG);
        db = getFirestore(app);
        isFirebaseInitialized = true;
    }
} catch (e) { console.error("Firebase Init Error:", e); }

// --- Helper Functions ---
const normalizeString = (str) => {
    if (!str) return "";
    return str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
};

// ★表記ゆれ対応：入力された校舎名から登録IDを特定する
const findCampusId = (inputName, campusList) => {
    if (!inputName) return null;
    const normInput = normalizeString(inputName);
    const byId = campusList.find(c => c.id === inputName);
    if (byId) return byId.id;
    const byExact = campusList.find(c => normalizeString(c.name) === normInput || normalizeString(c.sheetName) === normInput);
    if (byExact) return byExact.id;
    const byPartial = campusList.find(c => {
        const cName = normalizeString(c.name);
        const cSheet = normalizeString(c.sheetName);
        return (cName && normInput.includes(cName)) || (cSheet && normInput.includes(cSheet));
    });
    return byPartial ? byPartial.id : null;
};

const parseDate = (v) => {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    if (v.seconds) return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const formatDateStr = (date) => {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
};

const getFiscalYear = (date) => (date && date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear());
const formatYen = (val) => `¥${val.toLocaleString()}`;
const createInitialPlanData = () => MONTHS_LIST.reduce((acc, m) => { acc[m] = { enrollments: 0, trials: 0, touchTry: 0, flyers: 0, rate: 0 }; return acc; }, {});

const getWeeksStruct = (fiscalYear, monthIndex) => {
    let targetYear = fiscalYear;
    let jsMonth = monthIndex + 3;
    if (jsMonth > 11) { jsMonth -= 12; targetYear += 1; }
    const daysInMonth = new Date(targetYear, jsMonth + 1, 0).getDate();
    const weeks = [];
    let startDay = 1;
    for (let day = 1; day <= daysInMonth; day++) {
        const dayOfWeek = new Date(targetYear, jsMonth, day).getDay();
        if (dayOfWeek === 0 || day === daysInMonth) {
            weeks.push({ name: `第${weeks.length + 1}週 (${startDay}日～${day}日)`, startDay, endDay: day });
            startDay = day + 1;
        }
    }
    return { weeks, daysInMonth, targetYear, jsMonth };
};

// --- UI Components ---
const StatCard = ({ title, value, subValue, trend, icon: Icon, color, details }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${color}`}><Icon className="w-6 h-6 text-white" /></div>
        </div>
        <div className="mt-4 flex items-center text-sm">
            <span className={`flex items-center font-medium ${trend !== 0 ? (trend >= 0 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}`}>
                {trend !== 0 && (trend >= 0 ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />)}
                {trend !== 0 ? `${Math.abs(trend)}%` : '-'}
            </span>
            <span className="text-slate-400 ml-2">{subValue}</span>
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

// --- Main App ---
function RobotSchoolDashboard() {
    const today = new Date();
    const currentFiscalYear = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    const currentMonthStr = `${today.getMonth() + 1}月`;

    const [activeTab, setActiveTab] = useState('summary');
    const [selectedCampusId, setSelectedCampusId] = useState('All');
    const [viewMode, setViewMode] = useState('monthly');
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [selectedYear, setSelectedYear] = useState(currentFiscalYear);
    const [isCampusMenuOpen, setIsCampusMenuOpen] = useState(true);
    const [expandedCampusId, setExpandedCampusId] = useState(null);

    const [campusList, setCampusList] = useState([]);
    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);
    const [realDailyReports, setRealDailyReports] = useState([]);
    const [realTrialApps, setRealTrialApps] = useState([]);
    const [planData, setPlanData] = useState(createInitialPlanData());

    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [rawDataMap, setRawDataMap] = useState(null);
    const [displayData, setDisplayData] = useState([]);
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);
    const [reportDate, setReportDate] = useState(formatDateStr(new Date()));
    const [dailyReportInput, setDailyReportInput] = useState({ weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });

    const selectedCampusName = useMemo(() => {
        if (selectedCampusId === 'All') return '全校舎 (合計)';
        return campusList.find(c => c.id === selectedCampusId)?.name || selectedCampusId;
    }, [selectedCampusId, campusList]);

    // Data Fetching
    const fetchData = async (useCache = true) => {
        if (!isFirebaseInitialized) return;
        setIsSyncing(true);
        try {
            if (useCache) {
                const cachedCampuses = localStorage.getItem(CACHE_KEYS.CAMPUSES);
                if (cachedCampuses) {
                    setCampusList(JSON.parse(cachedCampuses));
                    setRealEnrollments(JSON.parse(localStorage.getItem(CACHE_KEYS.ENROLLMENTS) || '[]'));
                    setRealStatusChanges(JSON.parse(localStorage.getItem(CACHE_KEYS.STATUS) || '[]'));
                    setRealTransfers(JSON.parse(localStorage.getItem(CACHE_KEYS.TRANSFERS) || '[]'));
                    setRealDailyReports(JSON.parse(localStorage.getItem(CACHE_KEYS.DAILY_REPORTS) || '[]'));
                    setRealTrialApps(JSON.parse(localStorage.getItem(CACHE_KEYS.TRIAL_APPS) || '[]'));
                    setLastUpdated(new Date(localStorage.getItem(CACHE_KEYS.LAST_UPDATED)));
                    setIsLoading(false);
                    setIsSyncing(false);
                    return;
                }
            }

            const snaps = await Promise.all([
                getDocs(query(collection(db, "campuses"), orderBy("createdAt"))),
                getDocs(collection(db, "enrollments")),
                getDocs(collection(db, "status_changes")),
                getDocs(collection(db, "transfers")),
                getDocs(collection(db, "daily_reports")),
                getDocs(collection(db, "trial_applications"))
            ]);

            const data = {
                campuses: snaps[0].docs.map(d => ({ id: d.id, name: d.data().name || d.id, sheetName: d.data().sheetName || d.id })),
                enrollments: snaps[1].docs.map(d => d.data()),
                status: snaps[2].docs.map(d => d.data()),
                transfers: snaps[3].docs.map(d => d.data()),
                reports: snaps[4].docs.map(d => d.data()),
                trialApps: snaps[5].docs.map(d => d.data()),
                now: new Date()
            };

            setCampusList(data.campuses);
            setRealEnrollments(data.enrollments);
            setRealStatusChanges(data.status);
            setRealTransfers(data.transfers);
            setRealDailyReports(data.reports);
            setRealTrialApps(data.trialApps);
            setLastUpdated(data.now);

            localStorage.setItem(CACHE_KEYS.CAMPUSES, JSON.stringify(data.campuses));
            localStorage.setItem(CACHE_KEYS.ENROLLMENTS, JSON.stringify(data.enrollments));
            localStorage.setItem(CACHE_KEYS.STATUS, JSON.stringify(data.status));
            localStorage.setItem(CACHE_KEYS.TRANSFERS, JSON.stringify(data.transfers));
            localStorage.setItem(CACHE_KEYS.DAILY_REPORTS, JSON.stringify(data.reports));
            localStorage.setItem(CACHE_KEYS.TRIAL_APPS, JSON.stringify(data.trialApps));
            localStorage.setItem(CACHE_KEYS.LAST_UPDATED, data.now.toISOString());
        } catch (e) { console.error(e); } finally { setIsLoading(false); setIsSyncing(false); }
    };

    useEffect(() => { fetchData(true); }, []);

    // 集計ロジック
    useEffect(() => {
        if (campusList.length === 0) return;
        const map = {};
        const getCid = (name) => findCampusId(name, campusList);

        const trialMap = {}; // CID -> Apps
        realTrialApps.forEach(app => {
            const cid = getCid(app.campus);
            if (cid) { if (!trialMap[cid]) trialMap[cid] = []; trialMap[cid].push(app); }
        });

        const reportMap = {};
        realDailyReports.forEach(r => {
            const cid = getCid(r.campusId);
            if (cid && r.date) reportMap[`${cid}_${r.date}`] = r;
        });

        const countEvents = (list, typeFilter) => {
            const counts = {};
            list.forEach(item => {
                const date = parseDate(item.date);
                if (!date || getFiscalYear(date) !== selectedYear) return;
                if (typeFilter && (!item.type || !item.type.includes(typeFilter))) return;
                const cid = getCid(item.campus);
                if (!cid) return;
                const mIdx = (date.getMonth() + 9) % 12;
                if (!counts[cid]) counts[cid] = Array(12).fill(0).map(() => ({ total: 0, days: {} }));
                counts[cid][mIdx].total++;
                counts[cid][mIdx].days[date.getDate()] = (counts[cid][mIdx].days[date.getDate()] || 0) + 1;
            });
            return counts;
        };

        const enrC = countEvents(realEnrollments);
        const wdrC = countEvents(realStatusChanges, "退会");
        const recC = countEvents(realStatusChanges, "休会");
        const retC = countEvents(realStatusChanges, "復会");
        const tOutC = countEvents(realStatusChanges, "転校");
        const tInC = countEvents(realTransfers);
        const gradC = countEvents(realStatusChanges, "卒業");

        [...campusList, { id: 'All' }].forEach(campus => {
            if (campus.id === 'All') return;
            const cid = campus.id;
            let currentCount = 0; // 簡易化のため0開始

            map[cid] = MONTHS_LIST.map((month, mIdx) => {
                const { weeks, daysInMonth, targetYear: tYear, jsMonth: tMonth } = getWeeksStruct(selectedYear, mIdx);
                
                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const dNum = dIdx + 1;
                    const dateStr = `${tYear}-${('0'+(tMonth+1)).slice(-2)}-${('0'+dNum).slice(-2)}`;
                    const report = reportMap[`${cid}_${dateStr}`] || {};
                    
                    let dTrialApp = 0, dTrialExec = 0;
                    (trialMap[cid] || []).forEach(app => {
                        if (formatDateStr(parseDate(app.date)) === dateStr) dTrialApp++;
                        if (app.trialDate && formatDateStr(parseDate(app.trialDate)) === dateStr) dTrialExec++;
                    });

                    const dEnr = enrC[cid]?.[mIdx]?.days[dNum] || 0;
                    const dWdr = wdrC[cid]?.[mIdx]?.days[dNum] || 0;

                    return {
                        name: `${dNum}日`,
                        newEnrollments: dEnr,
                        withdrawals: dWdr,
                        withdrawals_neg: -dWdr,
                        returns: retC[cid]?.[mIdx]?.days[dNum] || 0,
                        recesses: recC[cid]?.[mIdx]?.days[dNum] || 0,
                        recesses_neg: -(recC[cid]?.[mIdx]?.days[dNum] || 0),
                        transferIns: tInC[cid]?.[mIdx]?.days[dNum] || 0,
                        transfers: tOutC[cid]?.[mIdx]?.days[dNum] || 0,
                        transfers_neg: -(tOutC[cid]?.[mIdx]?.days[dNum] || 0),
                        graduates: gradC[cid]?.[mIdx]?.days[dNum] || 0,
                        graduates_neg: -(gradC[cid]?.[mIdx]?.days[dNum] || 0),
                        flyers: report.flyers || 0,
                        touchAndTry: report.touchTry || 0,
                        trialLessons: report.trialLessons || 0,
                        trialApp: dTrialApp,
                        trialExec: dTrialExec
                    };
                });

                const mSum = daily.reduce((a, b) => {
                    Object.keys(a).forEach(k => { if (typeof a[k] === 'number') a[k] += b[k]; });
                    return a;
                }, { name: month, newEnrollments: 0, withdrawals: 0, withdrawals_neg:0, returns: 0, recesses: 0, recesses_neg: 0, transferIns: 0, transfers: 0, transfers_neg: 0, graduates: 0, graduates_neg: 0, flyers: 0, touchAndTry: 0, trialLessons:0, trialApp: 0, trialExec: 0 });

                currentCount += (mSum.newEnrollments + mSum.transferIns) - (mSum.withdrawals + mSum.transfers + mSum.graduates);
                mSum.totalStudents = currentCount;
                mSum.daily = daily;
                mSum.weekly = weeks.map(w => {
                    const wData = daily.slice(w.startDay - 1, w.endDay);
                    return wData.reduce((a, b) => {
                        Object.keys(a).forEach(k => { if (typeof a[k] === 'number' && k !== 'name') a[k] += b[k]; });
                        return a;
                    }, { name: w.name, newEnrollments:0, trialApp:0, trialExec:0, flyers:0, withdrawals_neg: 0 });
                });
                return mSum;
            });
        });

        // 合計
        map['All'] = MONTHS_LIST.map((_, mIdx) => {
            const combined = { ...map[campusList[0].id][mIdx] };
            campusList.slice(1).forEach(c => {
                const data = map[c.id][mIdx];
                Object.keys(combined).forEach(k => { if (typeof combined[k] === 'number' && k !== 'totalStudents') combined[k] += data[k]; });
            });
            return combined;
        });

        setRawDataMap(map);
    }, [campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, selectedYear]);

    useEffect(() => {
        if (!rawDataMap) return;
        const cData = rawDataMap[selectedCampusId] || [];
        if (viewMode === 'annual') setDisplayData(cData);
        else {
            const mData = cData.find(d => d.name === selectedMonth);
            setDisplayData(mData ? (viewMode === 'monthly' ? mData.daily : mData.weekly) : []);
        }
    }, [selectedCampusId, viewMode, selectedMonth, rawDataMap]);

    const totals = useMemo(() => {
        return displayData.reduce((a, b) => ({
            newEnrollments: a.newEnrollments + (b.newEnrollments || 0),
            withdrawals: a.withdrawals + (b.withdrawals || 0),
            trialApp: a.trialApp + (b.trialApp || 0),
            trialExec: a.trialExec + (b.trialExec || 0),
            flyers: a.flyers + (b.flyers || 0),
            trialLessons: a.trialLessons + (b.trialLessons || 0)
        }), { newEnrollments: 0, withdrawals: 0, trialApp: 0, trialExec: 0, flyers: 0, trialLessons:0 });
    }, [displayData]);

    const handleMenuClick = (tab, cid = 'All') => { setActiveTab(tab); setSelectedCampusId(cid); };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            {/* Sidebar (復元) */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 overflow-y-auto">
                <div className="p-6 border-b border-slate-800 flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-white" /></div>
                    <span className="text-lg font-bold">RobotSchool<span className="text-blue-400">Dash</span></span>
                </div>
                <nav className="flex-1 py-4 px-3 space-y-1">
                    <button onClick={() => handleMenuClick('summary')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'summary' ? 'bg-blue-600' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <LayoutDashboard className="w-5 h-5" /><span className="font-medium">経営サマリー</span>
                    </button>
                    <button onClick={() => handleMenuClick('marketing')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'marketing' ? 'bg-blue-600' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Megaphone className="w-5 h-5" /><span className="font-medium">集客・販促</span>
                    </button>
                    
                    <div className="pt-4 pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider flex justify-between cursor-pointer" onClick={() => setIsCampusMenuOpen(!isCampusMenuOpen)}>
                        <span>校舎管理</span><ChevronDown className={`w-4 h-4 transition-transform ${isCampusMenuOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {isCampusMenuOpen && campusList.map(c => (
                        <div key={c.id} className="ml-2">
                            <button onClick={() => setExpandedCampusId(expandedCampusId === c.id ? null : c.id)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 ${expandedCampusId === c.id ? 'text-white' : ''}`}>
                                <div className="flex items-center"><Building className="w-4 h-4 mr-2" /><span className="text-sm">{c.name}</span></div>
                                <ChevronRight className={`w-3 h-3 transition-transform ${expandedCampusId === c.id ? 'rotate-90' : ''}`} />
                            </button>
                            {expandedCampusId === c.id && (
                                <div className="ml-4 pl-2 border-l border-slate-700 mt-1 space-y-1">
                                    <button onClick={() => handleMenuClick('campus_daily', c.id)} className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:text-blue-400">└ 日報・カレンダー</button>
                                </div>
                            )}
                        </div>
                    ))}
                </nav>
                <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
                    <span>{lastUpdated?.toLocaleTimeString()} 更新</span>
                    <button onClick={() => fetchData(false)}><RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} /></button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden h-screen">
                <header className="bg-white border-b h-16 flex items-center justify-between px-6 sticky top-0 z-10 shrink-0">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{{summary:'経営サマリー', marketing:'集客・販促管理', campus_daily:'日報入力'}[activeTab]}</h1>
                        <p className="text-xs text-slate-500 flex items-center"><MapPin className="w-3 h-3 mr-1"/> {selectedCampusName}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-slate-100 border-none text-sm rounded-lg px-3 py-1.5 focus:ring-0">{YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}</select>
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            {['annual','monthly','weekly'].map(m => <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1 text-xs font-medium rounded-md ${viewMode === m ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>{{annual:'年度',monthly:'月度',weekly:'週次'}[m]}</button>)}
                        </div>
                        {viewMode !== 'annual' && <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-slate-100 border-none text-sm rounded-lg px-3 py-1.5 focus:ring-0">{MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}</select>}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'summary' && (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatCard title="体験予約 (申込基準)" value={`${totals.trialApp}件`} subValue="システム自動集計" trend={0} icon={Calendar} color="bg-blue-500" />
                                <StatCard title="体験実施 (当日基準)" value={`${totals.trialExec}件`} subValue="システム自動集計" trend={0} icon={Activity} color="bg-amber-500" details={[{label:'日報手入力', value:totals.trialLessons}]} />
                                <StatCard title="新規入会" value={`${totals.newEnrollments}名`} subValue="期間内確定分" trend={0} icon={Users} color="bg-emerald-500" />
                                <StatCard title="門配数" value={`${totals.flyers}枚`} subValue="日報集計" trend={0} icon={Megaphone} color="bg-slate-500" />
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border h-[450px]">
                                <h3 className="text-lg font-bold mb-6">入会・体験推移チャート</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={displayData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis yAxisId="left" />
                                        <YAxis yAxisId="right" orientation="right" />
                                        <Tooltip />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="trialApp" name="体験予約" fill="#3b82f6" radius={[4,4,0,0]} />
                                        <Bar yAxisId="left" dataKey="trialExec" name="体験実施" fill="#f59e0b" radius={[4,4,0,0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} dot={{r:4}} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {activeTab === 'marketing' && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border animate-in fade-in duration-500">
                            <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold">集客ファネル・詳細</h3></div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                                        <tr><th className="px-4 py-3">期間</th><th className="px-4 py-3">門配</th><th className="px-4 py-3">T&T</th><th className="px-4 py-3 text-blue-600">体験予約</th><th className="px-4 py-3 text-amber-600">体験実施</th><th className="px-4 py-3 text-emerald-600">入会</th></tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {displayData.map((r, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-medium">{r.name}</td><td>{r.flyers}</td><td>{r.touchAndTry}</td>
                                                <td className="font-bold text-blue-600">{r.trialApp}</td><td className="font-bold text-amber-600">{r.trialExec}</td>
                                                <td className="font-bold text-emerald-600">{r.newEnrollments}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
