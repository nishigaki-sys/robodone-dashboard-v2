import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, AlertCircle, MapPin, Settings, Plus, Trash2, School, Database, Wifi, FileText, Save, RefreshCw, Sun, Cloud, CloudRain, Snowflake, PenTool, ChevronDown, ChevronRight, Building, X, Ban } from "lucide-react";
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
    CAMPUSES: 'dash_campuses',
    ENROLLMENTS: 'dash_enrollments',
    STATUS: 'dash_status',
    TRANSFERS: 'dash_transfers',
    DAILY_REPORTS: 'dash_daily_reports',
    TRIAL_APPS: 'dash_trial_apps',
    LAST_UPDATED: 'dash_last_updated'
};

// Firebase Init
let db = null;
let isFirebaseInitialized = false;
try {
    if (FIREBASE_CONFIG.apiKey) {
        const app = initializeApp(FIREBASE_CONFIG);
        db = getFirestore(app);
        isFirebaseInitialized = true;
    }
} catch (e) { console.error("Firebase Init Error:", e); }

// ==========================================
// Helper Functions
// ==========================================
const normalizeString = (str) => {
    if (!str) return "";
    return str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
};

// ★ 校舎ID特定用の高度なヘルパー関数 (表記ゆれ対応)
const findCampusId = (inputName, campusList) => {
    if (!inputName) return null;
    const normInput = normalizeString(inputName);
    
    // 1. IDでの完全一致
    const byId = campusList.find(c => c.id === inputName);
    if (byId) return byId.id;
    
    // 2. 正規化された名称/シート名での完全一致
    const byExactName = campusList.find(c => 
        normalizeString(c.name) === normInput || 
        normalizeString(c.sheetName) === normInput
    );
    if (byExactName) return byExactName.id;
    
    // 3. 部分一致 (例: "ロボ団エディオン豊田本店校" に "豊田本店校" が含まれるか)
    const byPartial = campusList.find(c => {
        const cName = normalizeString(c.name);
        const cSheet = normalizeString(c.sheetName);
        return (cName && normInput.includes(cName)) || (cSheet && normInput.includes(cSheet));
    });
    if (byPartial) return byPartial.id;

    return null;
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

const formatYen = (val) => `¥${val.toLocaleString()}`;

const createInitialPlanData = () => {
    return MONTHS_LIST.reduce((acc, month) => {
        acc[month] = { enrollments: 0, trials: 0, touchTry: 0, flyers: 0, rate: 0 };
        return acc;
    }, {});
};

const getWeeksStruct = (fiscalYear, monthIndex) => {
    let targetYear = fiscalYear;
    let jsMonth = monthIndex + 3;
    if (jsMonth > 11) {
        jsMonth -= 12;
        targetYear += 1;
    }
    const daysInMonth = new Date(targetYear, jsMonth + 1, 0).getDate();
    const weeks = [];
    let startDay = 1;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(targetYear, jsMonth, day);
        const dayOfWeek = dateObj.getDay();
        let isWeekEnd = (dayOfWeek === 0) || (day === daysInMonth);

        if (isWeekEnd) {
            weeks.push({
                name: `第${weeks.length + 1}週 (${startDay}日～${day}日)`,
                startDay: startDay,
                endDay: day
            });
            startDay = day + 1;
        }
    }
    return { weeks, daysInMonth, targetYear, jsMonth };
};

// UI Components
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

// Main Component
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
    
    const [reportDate, setReportDate] = useState(formatDateStr(new Date()));
    const [dailyReportInput, setDailyReportInput] = useState({ weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });
    const [isSavingReport, setIsSavingReport] = useState(false);
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);

    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    const [planData, setPlanData] = useState(createInitialPlanData());
    const [isSavingPlan, setIsSavingPlan] = useState(false);

    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);
    const [realDailyReports, setRealDailyReports] = useState([]);
    const [realTrialApps, setRealTrialApps] = useState([]);

    const [rawDataMap, setRawDataMap] = useState(null);
    const [displayData, setDisplayData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);

    const selectedCampusName = useMemo(() => {
        if (selectedCampusId === 'All') return '全校舎 (合計)';
        const campus = campusList.find(c => c.id === selectedCampusId);
        return campus ? campus.name : selectedCampusId;
    }, [selectedCampusId, campusList]);

    const loadFromCache = () => {
        try {
            const cachedCampuses = localStorage.getItem(CACHE_KEYS.CAMPUSES);
            const cachedEnroll = localStorage.getItem(CACHE_KEYS.ENROLLMENTS);
            const cachedStatus = localStorage.getItem(CACHE_KEYS.STATUS);
            const cachedTransfers = localStorage.getItem(CACHE_KEYS.TRANSFERS);
            const cachedReports = localStorage.getItem(CACHE_KEYS.DAILY_REPORTS);
            const cachedTrialApps = localStorage.getItem(CACHE_KEYS.TRIAL_APPS);
            const cachedTime = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);

            if (cachedCampuses) {
                setCampusList(JSON.parse(cachedCampuses));
                setRealEnrollments(cachedEnroll ? JSON.parse(cachedEnroll) : []);
                setRealStatusChanges(cachedStatus ? JSON.parse(cachedStatus) : []);
                setRealTransfers(cachedTransfers ? JSON.parse(cachedTransfers) : []);
                setRealDailyReports(cachedReports ? JSON.parse(cachedReports) : []);
                setRealTrialApps(cachedTrialApps ? JSON.parse(cachedTrialApps) : []);
                if (cachedTime) setLastUpdated(new Date(cachedTime));
                setIsUsingCache(true);
                return true;
            }
        } catch (e) { console.error("Cache error", e); }
        return false;
    };

    const fetchFromFirebaseAndCache = async () => {
        if (!isFirebaseInitialized || !db) return;
        setIsSyncing(true);
        try {
            const [campusSnap, enrollSnap, statusSnap, transferSnap, reportSnap, trialSnap] = await Promise.all([
                getDocs(query(collection(db, "campuses"), orderBy("createdAt"))),
                getDocs(collection(db, "enrollments")),
                getDocs(collection(db, "status_changes")),
                getDocs(collection(db, "transfers")),
                getDocs(collection(db, "daily_reports")),
                getDocs(collection(db, "trial_applications"))
            ]);

            const campuses = campusSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id, sheetName: doc.data().sheetName || doc.id }));
            const enrollments = enrollSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const status = statusSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const transfers = transferSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const reports = reportSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const trialApps = trialSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const now = new Date();

            setCampusList(campuses);
            setRealEnrollments(enrollments);
            setRealStatusChanges(status);
            setRealTransfers(transfers);
            setRealDailyReports(reports);
            setRealTrialApps(trialApps);
            setLastUpdated(now);
            setIsUsingCache(false);

            localStorage.setItem(CACHE_KEYS.CAMPUSES, JSON.stringify(campuses));
            localStorage.setItem(CACHE_KEYS.ENROLLMENTS, JSON.stringify(enrollments));
            localStorage.setItem(CACHE_KEYS.STATUS, JSON.stringify(status));
            localStorage.setItem(CACHE_KEYS.TRANSFERS, JSON.stringify(transfers));
            localStorage.setItem(CACHE_KEYS.DAILY_REPORTS, JSON.stringify(reports));
            localStorage.setItem(CACHE_KEYS.TRIAL_APPS, JSON.stringify(trialApps));
            localStorage.setItem(CACHE_KEYS.LAST_UPDATED, now.toISOString());
        } catch (e) {
            console.error(e);
            setErrorMsg("同期エラー: " + e.message);
        } finally { setIsSyncing(false); }
    };

    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            if (!loadFromCache()) await fetchFromFirebaseAndCache();
            setIsLoading(false);
        };
        init();
    }, []);

    useEffect(() => {
        const generateData = async () => {
            if (campusList.length === 0) return;
            setIsLoading(true);
            const map = generateAllCampusesData(campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, selectedYear);
            setRawDataMap(map);
            setIsLoading(false);
        };
        generateData();
    }, [campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, selectedYear]);

    useEffect(() => {
        if (rawDataMap) {
            const campusData = rawDataMap[selectedCampusId] || [];
            if (viewMode === 'annual') {
                setDisplayData(campusData);
            } else {
                const targetMonthData = campusData.find(d => d.name === selectedMonth);
                setDisplayData(targetMonthData ? (viewMode === 'monthly' ? targetMonthData.daily : targetMonthData.weekly) : []);
            }
        }
    }, [selectedCampusId, viewMode, selectedMonth, rawDataMap]);

    // ★ 集計コアロジック
    const generateAllCampusesData = (targetCampuses, realEnrollmentList, realStatusList, realTransferList, dailyReportsList, trialAppsList, targetYear) => {
        const dataMap = {};
        
        // ヘルパー：表記ゆれを考慮してIDを特定
        const getResolvedId = (name) => findCampusId(name, targetCampuses);

        // 体験会データのマッピング
        const trialDataByCampus = {};
        trialAppsList.forEach(app => {
            const cid = getResolvedId(app.campus);
            if (!cid) return;
            if (!trialDataByCampus[cid]) trialDataByCampus[cid] = [];
            trialDataByCampus[cid].push(app);
        });

        const reportMap = {};
        dailyReportsList.forEach(r => {
            const cid = getResolvedId(r.campusId);
            if (cid && r.date) reportMap[`${cid}_${r.date}`] = r;
        });

        const countEvents = (list, typeFilter = null) => {
            const counts = {};
            list.forEach(item => {
                const dateObj = parseDate(item.date);
                if (!dateObj || getFiscalYear(dateObj) !== targetYear) return;
                if (typeFilter && (!item.type || !item.type.includes(typeFilter))) return;
                
                const cid = getResolvedId(item.campus);
                if (!cid) return;

                const monthIdx = (dateObj.getMonth() + 9) % 12;
                const day = dateObj.getDate();
                if (!counts[cid]) counts[cid] = {};
                if (!counts[cid][monthIdx]) counts[cid][monthIdx] = { total: 0, days: {} };
                counts[cid][monthIdx].total++;
                if (!counts[cid][monthIdx].days[day]) counts[cid][monthIdx].days[day] = 0;
                counts[cid][monthIdx].days[day]++;
            });
            return counts;
        };

        const enrollCounts = countEvents(realEnrollmentList);
        const transInCounts = countEvents(realTransferList);
        const withdrawCounts = countEvents(realStatusList, "退会");
        const recessCounts = countEvents(realStatusList, "休会");
        const returnCounts = countEvents(realStatusList, "復会");
        const transOutCounts = countEvents(realStatusList, "転校");
        const gradCounts = countEvents(realStatusList, "卒業");

        targetCampuses.forEach(campusObj => {
            const cid = campusObj.id;
            let currentStudents = 0; // 年度開始時の生徒数は別途計算が必要（ここでは簡易化）
            const myTrialApps = trialDataByCampus[cid] || [];

            dataMap[cid] = MONTHS_LIST.map((month, mIdx) => {
                const getCount = (obj) => (obj[cid] && obj[cid][mIdx]) ? obj[cid][mIdx].total : 0;
                const getDays = (obj) => (obj[cid] && obj[cid][mIdx]) ? obj[cid][mIdx].days : {};

                const { weeks, daysInMonth, targetYear: tYear, jsMonth: tMonth } = getWeeksStruct(targetYear, mIdx);

                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const dayNum = dIdx + 1;
                    const dateStr = `${tYear}-${('0'+(tMonth+1)).slice(-2)}-${('0'+dayNum).slice(-2)}`;
                    const report = reportMap[`${cid}_${dateStr}`] || {};

                    // 体験会・イベント集計 (予約:申込日基準 / 実施:体験日基準)
                    let dTrialApp = 0, dEventApp = 0, dTrialExec = 0, dEventExec = 0;
                    myTrialApps.forEach(app => {
                        const isEvent = app.type && app.type.includes('イベント');
                        const appDate = parseDate(app.date);
                        const execDate = parseDate(app.trialDate);
                        if (appDate && formatDateStr(appDate) === dateStr) { if (isEvent) dEventApp++; else dTrialApp++; }
                        if (execDate && formatDateStr(execDate) === dateStr) { if (isEvent) dEventExec++; else dTrialExec++; }
                    });

                    const dEnr = getDays(enrollCounts)[dayNum] || 0;
                    const dWdr = getDays(withdrawCounts)[dayNum] || 0;
                    
                    return {
                        name: `${dayNum}日`,
                        newEnrollments: dEnr,
                        transferIns: getDays(transInCounts)[dayNum] || 0,
                        withdrawals: dWdr,
                        recesses: getDays(recessCounts)[dayNum] || 0,
                        returns: getDays(returnCounts)[dayNum] || 0,
                        transfers: getDays(transOutCounts)[dayNum] || 0,
                        graduates: getDays(gradCounts)[dayNum] || 0,
                        flyers: report.flyers || 0,
                        touchAndTry: report.touchTry || 0,
                        trialLessons: report.trialLessons || 0, // 日報の手入力値
                        trialApp: dTrialApp,
                        eventApp: dEventApp,
                        trialExec: dTrialExec,
                        eventExec: dEventExec,
                        withdrawals_neg: -dWdr
                    };
                });

                const monthlySummary = daily.reduce((acc, d) => {
                    acc.newEnrollments += d.newEnrollments;
                    acc.transferIns += d.transferIns;
                    acc.withdrawals += d.withdrawals;
                    acc.recesses += d.recesses;
                    acc.returns += d.returns;
                    acc.transfers += d.transfers;
                    acc.graduates += d.graduates;
                    acc.flyers += d.flyers;
                    acc.touchAndTry += d.touchAndTry;
                    acc.trialApp += d.trialApp;
                    acc.trialExec += d.trialExec;
                    acc.eventApp += d.eventApp;
                    acc.eventExec += d.eventExec;
                    acc.trialLessons += d.trialLessons;
                    return acc;
                }, { name: month, newEnrollments:0, transferIns:0, withdrawals:0, recesses:0, returns:0, transfers:0, graduates:0, flyers:0, touchAndTry:0, trialApp:0, trialExec:0, eventApp:0, eventExec:0, trialLessons:0, daily });

                // 週次集計
                monthlySummary.weekly = weeks.map(w => {
                    const wData = daily.slice(w.startDay - 1, w.endDay);
                    return wData.reduce((acc, d) => {
                        acc.newEnrollments += d.newEnrollments;
                        acc.trialApp += d.trialApp;
                        acc.trialExec += d.trialExec;
                        acc.flyers += d.flyers;
                        acc.withdrawals += d.withdrawals;
                        return acc;
                    }, { name: w.name, newEnrollments:0, trialApp:0, trialExec:0, flyers:0, withdrawals:0, withdrawals_neg: 0 });
                });

                return monthlySummary;
            });
        });

        // 合計 ('All') ロジック
        dataMap['All'] = MONTHS_LIST.map((month, idx) => {
            const combined = { name: month, newEnrollments:0, transferIns:0, withdrawals:0, recesses:0, returns:0, transfers:0, graduates:0, flyers:0, touchAndTry:0, trialApp:0, trialExec:0, eventApp:0, eventExec:0, trialLessons:0 };
            targetCampuses.forEach(c => {
                const d = dataMap[c.id][idx];
                Object.keys(combined).forEach(k => { if(typeof combined[k] === 'number') combined[k] += d[k]; });
            });
            // 詳細データは簡易的に最初の校舎の構造をコピー(実際にはマージが必要)
            combined.daily = dataMap[targetCampuses[0].id][idx].daily.map((d, i) => {
                const dayTotal = {...d, name: d.name};
                targetCampuses.slice(1).forEach(c => {
                    const other = dataMap[c.id][idx].daily[i];
                    Object.keys(dayTotal).forEach(k => { if(typeof dayTotal[k] === 'number' && k !== 'name') dayTotal[k] += other[k]; });
                });
                return dayTotal;
            });
            return combined;
        });

        return dataMap;
    };

    const totals = useMemo(() => {
        if (!displayData || displayData.length === 0) return { newEnrollments: 0, trialApp: 0, trialExec: 0, flyers: 0 };
        return displayData.reduce((acc, curr) => ({
            newEnrollments: acc.newEnrollments + (curr.newEnrollments || 0),
            withdrawals: acc.withdrawals + (curr.withdrawals || 0),
            flyers: acc.flyers + (curr.flyers || 0),
            trialApp: acc.trialApp + (curr.trialApp || 0),
            trialExec: acc.trialExec + (curr.trialExec || 0),
            trialLessons: acc.trialLessons + (curr.trialLessons || 0),
        }), { newEnrollments: 0, withdrawals: 0, flyers: 0, trialApp: 0, trialExec: 0, trialLessons: 0 });
    }, [displayData]);

    // ハンドラー類 (中略 - オリジナルを維持)
    const handleMenuClick = (tab, cid = 'All') => { setActiveTab(tab); setSelectedCampusId(cid); };
    const fetchPlan = async () => {}; // Firebaseからの読み込み

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            {/* サイドバー */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 overflow-y-auto">
                <div className="p-6 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                        <TrendingUp className="w-6 h-6 text-blue-400" />
                        <span className="text-lg font-bold">RobotSchool Dash</span>
                    </div>
                </div>
                <nav className="flex-1 py-4 px-3 space-y-1">
                    <button onClick={() => handleMenuClick('summary')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg ${activeTab === 'summary' ? 'bg-blue-600' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <LayoutDashboard className="w-5 h-5" /><span>サマリー</span>
                    </button>
                    <button onClick={() => handleMenuClick('marketing')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg ${activeTab === 'marketing' ? 'bg-blue-600' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Megaphone className="w-5 h-5" /><span>集客・販促</span>
                    </button>
                    <div className="pt-4 px-3 text-xs font-semibold text-slate-500 uppercase">校舎一覧</div>
                    {campusList.map(c => (
                        <button key={c.id} onClick={() => handleMenuClick('summary', c.id)} className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm ${selectedCampusId === c.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                            <Building className="w-4 h-4" /><span>{c.name}</span>
                        </button>
                    ))}
                    <button onClick={() => handleMenuClick('settings')} className="w-full flex items-center space-x-3 px-3 py-2 text-slate-500 hover:text-white mt-4">
                        <Settings className="w-4 h-4" /><span>設定</span>
                    </button>
                </nav>
            </aside>

            {/* メインコンテンツ */}
            <main className="flex-1 flex flex-col overflow-hidden h-screen">
                <header className="bg-white border-b h-16 flex items-center justify-between px-6 shrink-0">
                    <h1 className="text-xl font-bold">{selectedCampusName}</h1>
                    <div className="flex space-x-2">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">{YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}</select>
                        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border rounded px-2 py-1 text-sm">{MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}</select>
                        <button onClick={fetchFromFirebaseAndCache} className="p-2 hover:bg-slate-100 rounded"><RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /></button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'summary' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatCard title="体験会予約" value={`${totals.trialApp}件`} subValue="期間中累計" icon={Calendar} color="bg-blue-500" />
                                <StatCard title="体験会実施" value={`${totals.trialExec}件`} subValue="期間中累計" icon={Activity} color="bg-amber-500" details={[{label:'日報入力値', value:totals.trialLessons}]} />
                                <StatCard title="新規入会" value={`${totals.newEnrollments}名`} subValue="期間中" icon={Users} color="bg-emerald-500" />
                                <StatCard title="門配数" value={`${totals.flyers}枚`} subValue="配布実績" icon={Megaphone} color="bg-slate-500" />
                            </div>
                            <div className="bg-white p-6 rounded-xl border h-[400px]">
                                <h3 className="font-bold mb-4">体験会・入会数推移</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={displayData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis yAxisId="left" />
                                        <YAxis yAxisId="right" orientation="right" />
                                        <Tooltip />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="trialApp" name="体験予約" fill="#3b82f6" />
                                        <Bar yAxisId="left" dataKey="trialExec" name="体験実施" fill="#f59e0b" />
                                        <Line yAxisId="right" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}

                    {activeTab === 'marketing' && (
                        <div className="bg-white p-6 rounded-xl border">
                            <h3 className="font-bold mb-6">集客詳細データ (日報 & 予約システム連携)</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 border-b">
                                        <tr>
                                            <th className="px-4 py-3">日付</th>
                                            <th className="px-4 py-3">門配</th>
                                            <th className="px-4 py-3">T&T</th>
                                            <th className="px-4 py-3 text-blue-600">体験予約</th>
                                            <th className="px-4 py-3 text-amber-600">体験実施</th>
                                            <th className="px-4 py-3 text-emerald-600">入会</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {displayData.map((d, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-2">{d.name}</td>
                                                <td className="px-4 py-2">{d.flyers}</td>
                                                <td className="px-4 py-2">{d.touchAndTry}</td>
                                                <td className="px-4 py-2 font-bold text-blue-600">{d.trialApp}</td>
                                                <td className="px-4 py-2 font-bold text-amber-600">{d.trialExec}</td>
                                                <td className="px-4 py-2 font-bold text-emerald-600">{d.newEnrollments}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="bg-white p-8 rounded-xl border">
                            <h2 className="text-lg font-bold mb-6">校舎設定</h2>
                            <div className="flex gap-4 mb-8">
                                <input type="text" placeholder="ID (toyota)" value={newCampusId} onChange={e => setNewCampusId(e.target.value)} className="border p-2 rounded" />
                                <input type="text" placeholder="校舎名 (豊田本店校)" value={newCampusName} onChange={e => setNewCampusName(e.target.value)} className="border p-2 rounded" />
                                <button onClick={async () => {
                                    if(!newCampusId || !newCampusName) return;
                                    await setDoc(doc(db, "campuses", newCampusId), { id: newCampusId, name: newCampusName, createdAt: serverTimestamp() });
                                    fetchFromFirebaseAndCache();
                                }} className="bg-blue-600 text-white px-4 py-2 rounded">追加</button>
                            </div>
                            <div className="space-y-2">
                                {campusList.map(c => (
                                    <div key={c.id} className="flex justify-between p-3 bg-slate-50 rounded">
                                        <span>{c.name} (ID: {c.id})</span>
                                        <button onClick={async () => { if(confirm('削除しますか？')) { await deleteDoc(doc(db, "campuses", c.id)); fetchFromFirebaseAndCache(); } }} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
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
