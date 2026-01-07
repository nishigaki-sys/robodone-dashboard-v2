import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, AlertCircle, MapPin, Settings, Plus, Trash2, School, Database, Wifi, FileText, Save, RefreshCw, Sun, Cloud, CloudRain, Snowflake, PenTool, ChevronDown, ChevronRight, Building, X, Ban, Upload } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";

// ==========================================
// ★ Firebase設定 (提供された設定を維持)
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

// ★ 収支の勘定科目分類定義
const ACCOUNT_CLASSIFICATION = {
    'revenue': ['A51', '5100'], // 売上
    'labor': ['A63', '6300'],   // 人件費
    'selling': ['A61', 'A62', '6100', '6200'], // 販売費
    'facility': ['A64', '6400'], // 設備費
    'admin': ['A65', '6500']    // 一般管理費
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
// Helper Functions (オリジナルを完全維持)
// ==========================================
const normalizeString = (str) => {
    if (!str) return "";
    return str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
};

const parseDate = (dateValue) => {
    if (!dateValue) return null;
    if (dateValue && typeof dateValue.toDate === 'function') return dateValue.toDate();
    if (dateValue && dateValue.seconds) return new Date(dateValue.seconds * 1000);
    const d = new Date(dateValue);
    return isNaN(d.getTime()) ? null : d;
};

const formatDateStr = (date) => {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
};

const getFiscalYear = (date) => {
    if (!date) return -1;
    return date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
};

const formatYen = (val) => `¥${Math.round(val || 0).toLocaleString()}`;

const createInitialPlanData = () => {
    return MONTHS_LIST.reduce((acc, month) => {
        acc[month] = { enrollments: 0, trials: 0, touchTry: 0, flyers: 0, rate: 0 };
        return acc;
    }, {});
};

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

// UI Components (オリジナルを維持)
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
            <span className="text-slate-400">{subValue}</span>
        </div>
        {details && details.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
                {details.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-500">
                        <span>{item.label}</span><span className="font-medium text-slate-700">{item.value}名</span>
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
    const [isCampusMenuOpen, setIsCampusMenuOpen] = useState(true);
    const [expandedCampusId, setExpandedCampusId] = useState(null);

    const [viewMode, setViewMode] = useState('monthly');
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [selectedYear, setSelectedYear] = useState(currentFiscalYear);

    const [campusList, setCampusList] = useState([]);
    const [newCampusName, setNewCampusName] = useState("");
    const [newCampusId, setNewCampusId] = useState("");
    const [newCampusSheetName, setNewCampusSheetName] = useState("");
    
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    // Data States
    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);
    const [realDailyReports, setRealDailyReports] = useState([]);
    const [realTrialApps, setRealTrialApps] = useState([]); 
    const [realFinances, setRealFinances] = useState([]); // ★追加

    const [rawDataMap, setRawDataMap] = useState(null);
    const [displayData, setDisplayData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);

    // 日報/計画入力用
    const [reportDate, setReportDate] = useState("");
    const [dailyReportInput, setDailyReportInput] = useState({ weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });
    const [isSavingReport, setIsSavingReport] = useState(false);
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);
    const [planData, setPlanData] = useState(createInitialPlanData());
    const [isSavingPlan, setIsSavingPlan] = useState(false);

    // CSVアップロード用
    const [isUploading, setIsUploading] = useState(false);
    const [uploadTargetId, setUploadTargetId] = useState("");

    const selectedCampusName = useMemo(() => {
        if (selectedCampusId === 'All') return '全校舎 (合計)';
        return campusList.find(c => c.id === selectedCampusId)?.name || selectedCampusId;
    }, [selectedCampusId, campusList]);

    const fetchFromFirebaseAndCache = async () => {
        if (!isFirebaseInitialized || !db) return;
        setIsSyncing(true);
        try {
            const [campusSnap, enrollSnap, statusSnap, transferSnap, reportSnap, trialSnap, financeSnap] = await Promise.all([
                getDocs(query(collection(db, "campuses"), orderBy("createdAt"))),
                getDocs(collection(db, "enrollments")),
                getDocs(collection(db, "status_changes")),
                getDocs(collection(db, "transfers")),
                getDocs(collection(db, "daily_reports")),
                getDocs(collection(db, "trial_applications")),
                getDocs(collection(db, "campus_finances"))
            ]);

            const campuses = campusSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const enrollments = enrollSnap.docs.map(d => d.data());
            const status = statusSnap.docs.map(d => d.data());
            const transfers = transferSnap.docs.map(d => d.data());
            const reports = reportSnap.docs.map(d => d.data());
            const trialApps = trialSnap.docs.map(d => d.data());
            const finances = financeSnap.docs.map(d => d.data());
            const now = new Date();

            setCampusList(campuses);
            setRealEnrollments(enrollments);
            setRealStatusChanges(status);
            setRealTransfers(transfers);
            setRealDailyReports(reports);
            setRealTrialApps(trialApps);
            setRealFinances(finances);
            setLastUpdated(now);

            // キャッシュ保存
            const cacheMap = {
                [CACHE_KEYS.CAMPUSES]: campuses, [CACHE_KEYS.ENROLLMENTS]: enrollments,
                [CACHE_KEYS.STATUS]: status, [CACHE_KEYS.TRANSFERS]: transfers,
                [CACHE_KEYS.DAILY_REPORTS]: reports, [CACHE_KEYS.TRIAL_APPS]: trialApps,
                [CACHE_KEYS.FINANCES]: finances, [CACHE_KEYS.LAST_UPDATED]: now.toISOString()
            };
            Object.entries(cacheMap).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        } catch (e) { setErrorMsg("同期エラー: " + e.message); } finally { setIsSyncing(false); setIsLoading(false); }
    };

    useEffect(() => { fetchFromFirebaseAndCache(); }, []);

    // CSV処理
    const handleCSVUpload = async (e, campusId) => {
        const file = e.target.files[0];
        if (!file || !campusId) return;
        setIsUploading(true);
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
            try {
                await setDoc(doc(db, "campus_finances", `${campusId}_${selectedYear}`), {
                    campusId, year: selectedYear, monthlyData, updatedAt: serverTimestamp()
                });
                alert("収支データを保存しました。");
                fetchFromFirebaseAndCache();
            } catch (err) { alert(err.message); } finally { setIsUploading(false); }
        };
        reader.readAsText(file);
    };

    // ==========================================
    // ★ 集計ロジック (オリジナルを統合)
    // ==========================================
    const generateAllData = () => {
        if (!campusList.length) return;
        const dataMap = {};
        
        const getResolvedCampusId = (rawName) => {
            if (!rawName) return null;
            const normInput = normalizeString(rawName);
            return campusList.find(c => {
                const normCName = normalizeString(c.name);
                const normCSheet = normalizeString(c.sheetName || c.name);
                return normInput.includes(normCName) || normInput.includes(normCSheet) || normCName.includes(normInput);
            })?.id;
        };

        const countTotalBefore = (list, year, typeFilter = null) => {
            const counts = {};
            list.forEach(item => {
                const dateObj = parseDate(item.date);
                if (!dateObj || getFiscalYear(dateObj) >= year) return;
                if (typeFilter && !item.type?.includes(typeFilter)) return;
                const cid = getResolvedCampusId(item.campus);
                if (cid) counts[cid] = (counts[cid] || 0) + 1;
            });
            return counts;
        };

        const prevEnroll = countTotalBefore(realEnrollments, selectedYear);
        const prevWithd = countTotalBefore(realStatusChanges, selectedYear, "退会");
        const prevGrad = countTotalBefore(realStatusChanges, selectedYear, "卒業");
        const prevTrans = countTotalBefore(realStatusChanges, selectedYear, "転校");
        const prevTransIn = countTotalBefore(realTransfers, selectedYear);

        campusList.forEach(campusObj => {
            const cid = campusObj.id;
            const finance = realFinances.find(f => f.campusId === cid && f.year === selectedYear);
            let currentStudents = (prevEnroll[cid] || 0) + (prevTransIn[cid] || 0) - (prevWithd[cid] || 0) - (prevGrad[cid] || 0) - (prevTrans[cid] || 0);

            dataMap[cid] = MONTHS_LIST.map((month, mIdx) => {
                const fData = finance?.monthlyData?.[month] || { revenue: 0, labor: 0, selling: 0, facility: 0, admin: 0 };
                const { weeks, daysInMonth, targetYear, jsMonth } = getWeeksStruct(selectedYear, mIdx);

                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const day = dIdx + 1;
                    const dateStr = `${targetYear}-${('0'+(jsMonth+1)).slice(-2)}-${('0'+day).slice(-2)}`;
                    const report = realDailyReports.find(r => r.campusId === cid && r.date === dateStr) || {};
                    const dEnroll = realEnrollments.filter(e => getResolvedCampusId(e.campus) === cid && formatDateStr(parseDate(e.date)) === dateStr).length;
                    const dWithd = realStatusChanges.filter(s => getResolvedCampusId(s.campus) === cid && formatDateStr(parseDate(s.date)) === dateStr && (s.type?.includes("退会") || s.type?.includes("卒業"))).length;
                    const dTrials = realTrialApps.filter(a => getResolvedCampusId(a.campus) === cid && a.trialDate && formatDateStr(parseDate(a.trialDate)) === dateStr).length;

                    return { name: `${day}日`, newEnrollments: dEnroll, withdrawals: dWithd, withdrawals_neg: -dWithd, flyers: report.flyers || 0, trialExec: dTrials, actualRevenue: 0 };
                });

                const weekly = weeks.map(w => {
                    const wData = daily.slice(w.startDay - 1, w.endDay).reduce((acc, curr) => ({
                        enroll: acc.enroll + curr.newEnrollments, withd: acc.withd + curr.withdrawals, flyers: acc.flyers + curr.flyers, trials: acc.trials + curr.trialExec
                    }), { enroll: 0, withd: 0, flyers: 0, trials: 0 });
                    return { name: w.name, newEnrollments: wData.enroll, withdrawals: wData.withd, withdrawals_neg: -wData.withd, flyers: wData.flyers, trialExec: wData.trials };
                });

                const mEnroll = daily.reduce((sum, d) => sum + d.newEnrollments, 0);
                const mWithd = daily.reduce((sum, d) => sum + d.withdrawals, 0);
                const mFlyers = daily.reduce((sum, d) => sum + d.flyers, 0);
                const mTrials = daily.reduce((sum, d) => sum + d.trialExec, 0);
                currentStudents += (mEnroll - mWithd);

                return {
                    name: month, actualRevenue: fData.revenue, actualExpense: fData.labor + fData.selling + fData.facility + fData.admin,
                    newEnrollments: mEnroll, withdrawals: mWithd, totalStudents: currentStudents, withdrawals_neg: -mWithd, flyers: mFlyers, trialExec: mTrials, daily, weekly
                };
            });
        });

        // 合計
        dataMap['All'] = MONTHS_LIST.map((month, idx) => {
            const res = { name: month, actualRevenue: 0, actualExpense: 0, newEnrollments: 0, withdrawals: 0, totalStudents: 0, withdrawals_neg: 0, flyers: 0, trialExec: 0, daily: [], weekly: [] };
            campusList.forEach(c => {
                const d = dataMap[c.id][idx];
                Object.keys(res).forEach(k => { if (typeof res[k] === 'number') res[k] += d[k]; });
                if (res.daily.length === 0) res.daily = d.daily.map(day => ({ ...day }));
                else d.daily.forEach((day, i) => { 
                    res.daily[i].newEnrollments += day.newEnrollments; 
                    res.daily[i].withdrawals += day.withdrawals; 
                    res.daily[i].withdrawals_neg -= day.withdrawals;
                    res.daily[i].flyers += day.flyers;
                    res.daily[i].trialExec += day.trialExec;
                });
            });
            return res;
        });
        setRawDataMap(dataMap);
    };

    useEffect(() => { generateAllData(); }, [campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, realFinances, selectedYear]);

    useEffect(() => {
        if (rawDataMap) {
            const cData = rawDataMap[selectedCampusId] || [];
            if (viewMode === 'annual') setDisplayData(cData);
            else {
                const mData = cData.find(d => d.name === selectedMonth);
                setDisplayData(mData ? (viewMode === 'monthly' ? mData.daily : mData.weekly) : []);
            }
        }
    }, [selectedCampusId, viewMode, selectedMonth, rawDataMap]);

    const totals = useMemo(() => {
        return displayData.reduce((acc, curr) => ({
            revenue: acc.revenue + (curr.actualRevenue || 0), expense: acc.expense + (curr.actualExpense || 0),
            enroll: acc.enroll + (curr.newEnrollments || 0), withdraw: acc.withdraw + (curr.withdrawals || 0),
            flyers: acc.flyers + (curr.flyers || 0), trials: acc.trials + (curr.trialExec || 0)
        }), { revenue: 0, expense: 0, enroll: 0, withdraw: 0, flyers: 0, trials: 0 });
    }, [displayData]);

    // UIレンダリング
    const renderCalendar = () => {
        const mIdx = MONTHS_LIST.indexOf(selectedMonth);
        const { daysInMonth, targetYear, jsMonth } = getWeeksStruct(selectedYear, mIdx);
        const firstDay = new Date(targetYear, jsMonth, 1).getDay();
        const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`b-${i}`} className="h-24 bg-slate-50 border border-slate-100"></div>);
        const days = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${targetYear}-${('0'+(jsMonth+1)).slice(-2)}-${('0'+day).slice(-2)}`;
            const report = realDailyReports.find(r => r.campusId === selectedCampusId && r.date === dateStr);
            const isToday = dateStr === formatDateStr(new Date());
            return (
                <div key={day} onClick={() => { setReportDate(dateStr); setIsInputModalOpen(true); }} className={`h-24 border border-slate-200 p-2 cursor-pointer hover:bg-blue-50 transition-colors ${isToday ? 'bg-blue-50/50' : 'bg-white'}`}>
                    <span className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{day}</span>
                    {report && <div className="mt-1 text-[10px] bg-blue-100 text-blue-700 p-1 rounded">門配: {report.flyers}</div>}
                </div>
            );
        });
        return [...blanks, ...days];
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans">
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
                <div className="p-6 font-bold text-xl border-b border-slate-800">RobotSchoolDash</div>
                <nav className="flex-1 p-4 space-y-2">
                    <button onClick={() => setActiveTab('summary')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'summary' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><LayoutDashboard /><span>経営サマリー</span></button>
                    <button onClick={() => setActiveTab('students')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'students' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Users /><span>生徒管理</span></button>
                    <button onClick={() => setActiveTab('marketing')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'marketing' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Megaphone /><span>集客・販促</span></button>
                    <button onClick={() => setActiveTab('daily')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'daily' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Calendar /><span>日報カレンダー</span></button>
                    <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings /><span>設定・CSV連携</span></button>
                </nav>
            </aside>

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="h-16 bg-white border-b flex items-center justify-between px-6 shrink-0">
                    <h1 className="font-bold text-lg">{selectedCampusName}</h1>
                    <div className="flex items-center space-x-3">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-slate-100 border-none rounded p-1 text-sm">{YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}</select>
                        <div className="flex bg-slate-100 rounded p-1 text-xs">
                            {['annual', 'monthly', 'weekly'].map(m => <button key={m} onClick={() => setViewMode(m)} className={`px-2 py-1 rounded ${viewMode === m ? 'bg-white shadow' : ''}`}>{m === 'annual' ? '年度' : m === 'monthly' ? '月度' : '週次'}</button>)}
                        </div>
                        {viewMode !== 'annual' && <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-slate-100 border-none rounded p-1 text-sm">{MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}</select>}
                        <select value={selectedCampusId} onChange={e => setSelectedCampusId(e.target.value)} className="bg-slate-100 border-none rounded p-1 text-sm"><option value="All">全校舎合計</option>{campusList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <button onClick={fetchFromFirebaseAndCache} className="p-2"><RefreshCw className={isSyncing ? 'animate-spin' : ''}/></button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'summary' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatCard title="売上実績" value={formatYen(totals.revenue)} icon={DollarSign} color="bg-blue-500" subValue="選択期間" />
                                <StatCard title="営業利益" value={formatYen(totals.revenue - totals.expense)} icon={TrendingUp} color="bg-emerald-500" subValue="収支差分" />
                                <StatCard title="在籍生徒" value={`${rawDataMap?.[selectedCampusId]?.[MONTHS_LIST.indexOf(selectedMonth)]?.totalStudents || 0}名`} icon={Users} color="bg-indigo-500" subValue="末日時点" />
                                <StatCard title="体験会実施" value={`${totals.trials}件`} icon={Calendar} color="bg-amber-500" subValue="実施ベース" />
                            </div>
                            <div className="bg-white p-6 rounded-xl border h-[400px]">
                                <h3 className="font-bold mb-4">収支と生徒数の推移</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={viewMode === 'annual' ? displayData : rawDataMap?.[selectedCampusId] || []}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip formatter={v => v.toLocaleString()} />
                                        <Legend />
                                        <Bar dataKey="actualRevenue" name="売上" fill="#3b82f6" />
                                        <Bar dataKey="actualExpense" name="経費" fill="#f43f5e" />
                                        <Line type="monotone" dataKey="totalStudents" name="生徒数" stroke="#6366f1" strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}

                    {activeTab === 'students' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-xl border h-[400px]">
                                <h3 className="font-bold mb-4">生徒数増減フロー</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={displayData} stackOffset="sign">
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <ReferenceLine y={0} stroke="#000" />
                                        <Bar dataKey="newEnrollments" name="入会" fill="#10b981" stackId="stack" />
                                        <Bar dataKey="withdrawals_neg" name="退会/卒業" fill="#ef4444" stackId="stack" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="bg-white rounded-xl border overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 border-b">
                                        <tr><th className="px-4 py-3">期間</th><th className="px-4 py-3 text-emerald-600">入会</th><th className="px-4 py-3 text-rose-600">退会</th><th className="px-4 py-3 font-bold">在籍数</th></tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {displayData.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50"><td className="px-4 py-3">{row.name}</td><td>{row.newEnrollments}</td><td>{row.withdrawals}</td><td className="font-bold">{row.totalStudents}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'marketing' && (
                        <div className="bg-white p-6 rounded-xl border h-[500px]">
                            <h3 className="font-bold mb-6">集客ファネル (門配 vs 体験会 vs 入会)</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={displayData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" />
                                    <YAxis yAxisId="left" />
                                    <YAxis yAxisId="right" orientation="right" />
                                    <Tooltip />
                                    <Legend />
                                    <Bar yAxisId="left" dataKey="flyers" name="門配" fill="#94a3b8" />
                                    <Bar yAxisId="left" dataKey="trialExec" name="体験会実施" fill="#f97316" />
                                    <Line yAxisId="right" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {activeTab === 'daily' && (
                        <div className="bg-white p-6 rounded-xl border">
                            <h3 className="font-bold mb-4">{selectedMonth} 日報カレンダー</h3>
                            <div className="grid grid-cols-7 gap-px bg-slate-200 border rounded-lg overflow-hidden">
                                {['日','月','火','水','木','金','土'].map(d => <div key={d} className="p-2 text-center text-xs font-bold bg-slate-50">{d}</div>)}
                                {renderCalendar()}
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="space-y-6">
                            <div className="bg-white p-8 rounded-xl border">
                                <h2 className="font-bold text-lg mb-6 flex items-center"><Upload className="mr-2" />収支CSVデータの取り込み</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {campusList.map(c => (
                                        <div key={c.id} className="p-4 border rounded-lg flex items-center justify-between bg-slate-50">
                                            <div><div className="font-bold">{c.name}</div><div className="text-xs text-slate-500">ID: {c.id}</div></div>
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
