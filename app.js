import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, AlertCircle, MapPin, Settings, Plus, Trash2, School, Database, Wifi, FileText, Save, RefreshCw, Sun, Cloud, CloudRain, Snowflake, PenTool, ChevronDown, ChevronRight, Building, X, Ban, Tag } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

// ==========================================
// ★ Firebase設定 (環境に合わせて変更してください)
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
    if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_API_KEY") {
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
    return str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).toLowerCase();
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
    if (jsMonth > 11) { jsMonth -= 12; targetYear += 1; }
    const daysInMonth = new Date(targetYear, jsMonth + 1, 0).getDate();
    const weeks = [];
    let startDay = 1;
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(targetYear, jsMonth, day);
        if (dateObj.getDay() === 0 || day === daysInMonth) {
            weeks.push({ name: `第${weeks.length + 1}週 (${startDay}-${day})`, startDay, endDay: day });
            startDay = day + 1;
        }
    }
    return { weeks, daysInMonth, targetYear, jsMonth };
};

// ==========================================
// Components
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
                        <span>{item.label}</span><span className="font-medium text-slate-700">{item.value}名</span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

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
    const [newAlias, setNewAlias] = useState("");
    
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
            const cachedTime = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);
            if (cachedCampuses && cachedEnroll) {
                setCampusList(JSON.parse(cachedCampuses));
                setRealEnrollments(JSON.parse(cachedEnroll));
                setRealStatusChanges(JSON.parse(localStorage.getItem(CACHE_KEYS.STATUS) || "[]"));
                setRealTransfers(JSON.parse(localStorage.getItem(CACHE_KEYS.TRANSFERS) || "[]"));
                setRealDailyReports(JSON.parse(localStorage.getItem(CACHE_KEYS.DAILY_REPORTS) || "[]"));
                setRealTrialApps(JSON.parse(localStorage.getItem(CACHE_KEYS.TRIAL_APPS) || "[]"));
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

            const campuses = campusSnap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                aliases: doc.data().aliases || [] 
            }));
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

    // 集計ロジック (ID統一版)
    const generateAllCampusesData = (targetCampuses, realEnrollmentList, realStatusList, realTransferList, dailyReportsList, trialAppsList, targetYear) => {
        const dataMap = {};
        
        // ★ID変換マップの構築 (エイリアス対応)
        const idLookup = {};
        targetCampuses.forEach(c => {
            idLookup[normalizeString(c.id)] = c.id;
            idLookup[normalizeString(c.name)] = c.id;
            if (c.sheetName) idLookup[normalizeString(c.sheetName)] = c.id;
            if (c.aliases) {
                c.aliases.forEach(alias => { idLookup[normalizeString(alias)] = c.id; });
            }
        });

        const getValidCampusId = (rawName) => {
            if (!rawName) return null;
            return idLookup[normalizeString(rawName)] || null;
        };

        const reportMap = {};
        dailyReportsList.forEach(r => {
            if (r.campusId && r.date) reportMap[`${r.campusId}_${r.date}`] = r;
        });

        const countTotalBefore = (list, year, typeFilter = null) => {
            const counts = {};
            list.forEach(item => {
                const dateObj = parseDate(item.date);
                if (!dateObj || getFiscalYear(dateObj) >= year) return;
                if (typeFilter && (!item.type || !item.type.includes(typeFilter))) return;
                const cid = getValidCampusId(item.campus || item.campusId);
                if (cid) counts[cid] = (counts[cid] || 0) + 1;
            });
            return counts;
        };

        const countEvents = (list, typeFilter = null) => {
            const counts = {};
            list.forEach(item => {
                const dateObj = parseDate(item.date);
                if (!dateObj || getFiscalYear(dateObj) !== targetYear) return;
                if (typeFilter && (!item.type || !item.type.includes(typeFilter))) return;
                const cid = getValidCampusId(item.campus || item.campusId);
                if (!cid) return;
                const mIdx = (dateObj.getMonth() + 9) % 12;
                if (!counts[cid]) counts[cid] = {};
                if (!counts[cid][mIdx]) counts[cid][mIdx] = { total: 0, days: {} };
                counts[cid][mIdx].total++;
                const d = dateObj.getDate();
                counts[cid][mIdx].days[d] = (counts[cid][mIdx].days[d] || 0) + 1;
            });
            return counts;
        };

        const prevEnrollments = countTotalBefore(realEnrollmentList, targetYear);
        const prevTransferIns = countTotalBefore(realTransferList, targetYear);
        const prevWithdrawals = countTotalBefore(realStatusList, targetYear, "退会");
        const prevTransfers = countTotalBefore(realStatusList, targetYear, "転校");
        const prevGraduates = countTotalBefore(realStatusList, targetYear, "卒業");

        const enrollmentCounts = countEvents(realEnrollmentList);
        const transferInCounts = countEvents(realTransferList);
        const withdrawalCounts = countEvents(realStatusList, "退会");
        const recessCounts = countEvents(realStatusList, "休会");
        const returnCounts = countEvents(realStatusList, "復会");
        const transferCounts = countEvents(realStatusList, "転校");
        const graduateCounts = countEvents(realStatusList, "卒業");

        targetCampuses.forEach(campusObj => {
            const cid = campusObj.id;
            let currentStudents = (prevEnrollments[cid]||0 + prevTransferIns[cid]||0) - (prevWithdrawals[cid]||0 + prevTransfers[cid]||0 + prevGraduates[cid]||0);

            dataMap[cid] = MONTHS_LIST.map((month, mIdx) => {
                const { weeks, daysInMonth, targetYear: tYear, jsMonth: tMonth } = getWeeksStruct(targetYear, mIdx);
                
                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const day = dIdx + 1;
                    const dateStr = `${tYear}-${('0'+(tMonth+1)).slice(-2)}-${('0'+day).slice(-2)}`;
                    const report = reportMap[`${cid}_${dateStr}`] || {};
                    
                    // 体験会自動集計 (Firebaseデータ)
                    let dTrialApp = 0, dEventApp = 0, dTrialExec = 0, dEventExec = 0;
                    trialAppsList.forEach(app => {
                        if (getValidCampusId(app.campus) !== cid) return;
                        const isEvent = app.type?.includes('イベント');
                        if (formatDateStr(parseDate(app.date)) === dateStr) { if(isEvent) dEventApp++; else dTrialApp++; }
                        if (formatDateStr(parseDate(app.trialDate)) === dateStr) { if(isEvent) dEventExec++; else dTrialExec++; }
                    });

                    const getDCount = (cObj) => (cObj[cid]?.[mIdx]?.days[day] || 0);
                    const dEnroll = getDCount(enrollmentCounts);
                    const dWithdraw = getDCount(withdrawalCounts);

                    return {
                        name: `${day}日`,
                        newEnrollments: dEnroll,
                        transferIns: getDCount(transferInCounts),
                        withdrawals: dWithdraw,
                        recesses: getDCount(recessCounts),
                        returns: getDCount(returnCounts),
                        transfers: getDCount(transferCounts),
                        graduates: getDCount(graduateCounts),
                        flyers: report.flyers || 0,
                        touchAndTry: report.touchTry || 0,
                        trialLessons: report.trialLessons || 0, // ★日報手入力数
                        trialApp: dTrialApp, trialExec: dTrialExec, // ★Firebase自動集計
                        eventApp: dEventApp, eventExec: dEventExec,
                        totalStudents: currentStudents,
                        withdrawals_neg: -dWithdraw
                    };
                });

                // 月間・週間集計
                const mData = {
                    name: month,
                    newEnrollments: daily.reduce((a,b)=>a+b.newEnrollments, 0),
                    transferIns: daily.reduce((a,b)=>a+b.transferIns, 0),
                    withdrawals: daily.reduce((a,b)=>a+b.withdrawals, 0),
                    recesses: daily.reduce((a,b)=>a+b.recesses, 0),
                    returns: daily.reduce((a,b)=>a+b.returns, 0),
                    transfers: daily.reduce((a,b)=>a+b.transfers, 0),
                    graduates: daily.reduce((a,b)=>a+b.graduates, 0),
                    flyers: daily.reduce((a,b)=>a+b.flyers, 0),
                    touchAndTry: daily.reduce((a,b)=>a+b.touchAndTry, 0),
                    trialLessons: daily.reduce((a,b)=>a+b.trialLessons, 0),
                    trialApp: daily.reduce((a,b)=>a+b.trialApp, 0),
                    trialExec: daily.reduce((a,b)=>a+b.trialExec, 0),
                    eventApp: daily.reduce((a,b)=>a+b.eventApp, 0),
                    eventExec: daily.reduce((a,b)=>a+b.eventExec, 0),
                    withdrawals_neg: 0,
                    daily,
                    weekly: weeks.map(w => {
                        const slice = daily.slice(w.startDay-1, w.endDay);
                        return {
                            name: w.name,
                            newEnrollments: slice.reduce((a,b)=>a+b.newEnrollments, 0),
                            trialApp: slice.reduce((a,b)=>a+b.trialApp, 0),
                            trialExec: slice.reduce((a,b)=>a+b.trialExec, 0),
                            trialLessons: slice.reduce((a,b)=>a+b.trialLessons, 0),
                            flyers: slice.reduce((a,b)=>a+b.flyers, 0)
                        };
                    })
                };
                
                currentStudents += (mData.newEnrollments + mData.transferIns) - (mData.withdrawals + mData.transfers + mData.graduates);
                mData.totalStudents = currentStudents;
                mData.withdrawals_neg = -mData.withdrawals;
                return mData;
            });
        });

        // 'All' 合計ロジック
        dataMap['All'] = MONTHS_LIST.map((_, idx) => {
            const combined = { name: MONTHS_LIST[idx], newEnrollments:0, withdrawals:0, totalStudents:0, flyers:0, trialLessons:0, trialApp:0, trialExec:0, eventApp:0, eventExec:0, withdrawals_neg:0 };
            targetCampuses.forEach(c => {
                const d = dataMap[c.id][idx];
                Object.keys(combined).forEach(k => { if(typeof combined[k]==='number' && k!=='name') combined[k] += d[k]; });
            });
            return combined;
        });

        return dataMap;
    };

    useEffect(() => {
        if (campusList.length > 0) {
            const map = generateAllCampusesData(campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, selectedYear);
            setRawDataMap(map);
        }
    }, [campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, selectedYear]);

    useEffect(() => {
        if (rawDataMap) {
            const campusData = rawDataMap[selectedCampusId] || [];
            if (viewMode === 'annual') setDisplayData(campusData);
            else {
                const m = campusData.find(d => d.name === selectedMonth);
                setDisplayData(m ? (viewMode === 'monthly' ? m.daily : m.weekly) : []);
            }
        }
    }, [selectedCampusId, viewMode, selectedMonth, rawDataMap]);

    const totals = useMemo(() => {
        if (!displayData.length) return { newEnrollments: 0, trialLessons: 0, trialExec: 0, flyers: 0 };
        return displayData.reduce((acc, curr) => ({
            newEnrollments: acc.newEnrollments + (curr.newEnrollments || 0),
            trialLessons: acc.trialLessons + (curr.trialLessons || 0),
            trialApp: acc.trialApp + (curr.trialApp || 0),
            trialExec: acc.trialExec + (curr.trialExec || 0),
            flyers: acc.flyers + (curr.flyers || 0),
        }), { newEnrollments: 0, trialLessons: 0, trialApp: 0, trialExec: 0, flyers: 0 });
    }, [displayData]);

    // 校舎追加・エイリアス管理
    const handleAddCampus = async () => {
        if (!newCampusId || !newCampusName) return alert("必須項目を入力してください");
        try {
            await setDoc(doc(db, "campuses", newCampusId), { id: newCampusId, name: newCampusName, aliases: [], createdAt: serverTimestamp() });
            fetchFromFirebaseAndCache();
            setNewCampusId(""); setNewCampusName("");
        } catch (e) { alert(e.message); }
    };

    const handleAddAlias = async (cid) => {
        if (!newAlias) return;
        try {
            await updateDoc(doc(db, "campuses", cid), { aliases: arrayUnion(newAlias) });
            setNewAlias("");
            fetchFromFirebaseAndCache();
        } catch (e) { alert(e.message); }
    };

    const handleRemoveAlias = async (cid, alias) => {
        try {
            await updateDoc(doc(db, "campuses", cid), { aliases: arrayRemove(alias) });
            fetchFromFirebaseAndCache();
        } catch (e) { alert(e.message); }
    };

    const handleSaveDailyReport = async () => {
        if (selectedCampusId === 'All') return;
        setIsSavingReport(true);
        try {
            await setDoc(doc(db, "daily_reports", `${selectedCampusId}_${reportDate}`), { 
                campusId: selectedCampusId, date: reportDate, ...dailyReportInput, updatedAt: serverTimestamp() 
            });
            await fetchFromFirebaseAndCache();
            setIsInputModalOpen(false);
        } catch (e) { alert(e.message); } finally { setIsSavingReport(false); }
    };

    if (isLoading && !rawDataMap) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 flex text-slate-900">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
                <div className="p-6 border-b border-slate-800 font-bold text-xl flex items-center gap-2">
                    <TrendingUp className="text-blue-400" /> RobotSchool<span className="text-blue-400">Dash</span>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    <button onClick={() => setActiveTab('summary')} className={`w-full flex items-center gap-3 p-3 rounded-lg ${activeTab==='summary'?'bg-blue-600':'hover:bg-slate-800 text-slate-400'}`}><LayoutDashboard className="w-5 h-5"/>サマリー</button>
                    <button onClick={() => setActiveTab('students')} className={`w-full flex items-center gap-3 p-3 rounded-lg ${activeTab==='students'?'bg-blue-600':'hover:bg-slate-800 text-slate-400'}`}><Users className="w-5 h-5"/>生徒管理</button>
                    <button onClick={() => setActiveTab('marketing')} className={`w-full flex items-center gap-3 p-3 rounded-lg ${activeTab==='marketing'?'bg-blue-600':'hover:bg-slate-800 text-slate-400'}`}><Megaphone className="w-5 h-5"/>マーケティング</button>
                    <div className="pt-4 text-xs font-bold text-slate-500 px-3 uppercase">校舎設定</div>
                    <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 p-3 rounded-lg ${activeTab==='settings'?'bg-blue-600':'hover:bg-slate-800 text-slate-400'}`}><Settings className="w-5 h-5"/>マスター管理</button>
                    {campusList.map(c => (
                        <div key={c.id}>
                            <button onClick={() => setExpandedCampusId(expandedCampusId===c.id?null:c.id)} className="w-full flex justify-between items-center p-3 text-slate-400 hover:text-white">
                                <span className="flex items-center gap-2 text-sm"><Building className="w-4 h-4"/>{c.name}</span>
                                <ChevronRight className={`w-3 h-3 transform ${expandedCampusId===c.id?'rotate-90':''}`}/>
                            </button>
                            {expandedCampusId===c.id && (
                                <div className="ml-6 space-y-1 border-l border-slate-700 pl-4">
                                    <button onClick={()=>{setActiveTab('campus_daily'); setSelectedCampusId(c.id);}} className="text-xs text-slate-500 hover:text-blue-400 py-1 block">└ 日報入力</button>
                                </div>
                            )}
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="h-16 bg-white border-b px-6 flex items-center justify-between sticky top-0 z-10">
                    <div>
                        <h1 className="font-bold text-lg">
                            {{summary:'経営サマリー', students:'生徒管理', marketing:'集客・マーケティング', settings:'校舎マスター管理', campus_daily:'日報入力'}[activeTab]}
                        </h1>
                        <p className="text-xs text-slate-500">{selectedCampusName}</p>
                    </div>
                    <div className="flex gap-2">
                        <select value={selectedYear} onChange={e=>setSelectedYear(Number(e.target.value))} className="bg-slate-100 border-none rounded-lg text-sm">{YEARS_LIST.map(y=><option key={y} value={y}>{y}年度</option>)}</select>
                        <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="bg-slate-100 border-none rounded-lg text-sm">{MONTHS_LIST.map(m=><option key={m} value={m}>{m}</option>)}</select>
                        <button onClick={fetchFromFirebaseAndCache} className="p-2 bg-slate-100 rounded-lg"><RefreshCw className={`w-4 h-4 ${isSyncing?'animate-spin':''}`}/></button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'summary' && (
                        <div className="grid grid-cols-4 gap-6">
                            <StatCard title="在籍生徒数" value={`${totals.totalStudents || 0}名`} icon={Users} color="bg-indigo-500" />
                            <StatCard title="今期入会数" value={`${totals.newEnrollments}名`} icon={Activity} color="bg-emerald-500" />
                            <StatCard title="体験実施(日報)" value={`${totals.trialLessons}回`} icon={Calendar} color="bg-amber-500" />
                            <StatCard title="体験予約(Firebase)" value={`${totals.trialExec}件`} icon={Wifi} color="bg-blue-500" />
                        </div>
                    )}

                    {activeTab === 'marketing' && (
                        <div className="bg-white p-6 rounded-xl border h-[500px]">
                            <h3 className="font-bold mb-6">体験会・イベント分析 (日報 vs 予約データ)</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={displayData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="trialApp" name="体験予約(FB)" fill="#93c5fd" />
                                    <Bar dataKey="trialExec" name="体験実行(FB)" fill="#3b82f6" />
                                    <Line type="monotone" dataKey="trialLessons" name="体験実施(日報)" stroke="#f59e0b" strokeWidth={3} />
                                    <Line type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="bg-white p-8 rounded-xl border space-y-8">
                            <div>
                                <h3 className="font-bold mb-4 flex items-center gap-2"><School className="text-blue-600"/> 新規校舎登録</h3>
                                <div className="flex gap-4">
                                    <input placeholder="校舎ID (英数)" value={newCampusId} onChange={e=>setNewCampusId(e.target.value)} className="border rounded-lg p-2 flex-1"/>
                                    <input placeholder="校舎名" value={newCampusName} onChange={e=>setNewCampusName(e.target.value)} className="border rounded-lg p-2 flex-1"/>
                                    <button onClick={handleAddCampus} className="bg-blue-600 text-white px-6 rounded-lg font-bold">追加</button>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="font-bold text-slate-500 uppercase text-xs">登録済み校舎一覧</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {campusList.map(c => (
                                        <div key={c.id} className="p-4 border rounded-xl bg-slate-50 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-bold">{c.name}</div>
                                                    <div className="text-xs text-slate-400 font-mono">ID: {c.id}</div>
                                                </div>
                                                <button onClick={()=>handleRemoveAlias(c.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="text-[10px] font-bold text-slate-400">表記ゆれ設定 (Aliases)</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {c.aliases.map(a => (
                                                        <span key={a} className="bg-white border px-2 py-1 rounded text-xs flex items-center gap-1">
                                                            {a} <button onClick={()=>handleRemoveAlias(c.id, a)}><X className="w-3 h-3 text-slate-400"/></button>
                                                        </span>
                                                    ))}
                                                    <div className="flex items-center gap-1 ml-2">
                                                        <input 
                                                            placeholder="追加..." 
                                                            className="text-xs border-b bg-transparent outline-none w-20"
                                                            onKeyDown={e => { if(e.key==='Enter') { handleAddAlias(c.id); } }}
                                                            value={newAlias} onChange={e=>setNewAlias(e.target.value)}
                                                        />
                                                        <Plus className="w-3 h-3 text-blue-500 cursor-pointer" onClick={()=>handleAddAlias(c.id)}/>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'campus_daily' && (
                        <div className="bg-white p-6 rounded-xl border">
                            <h3 className="font-bold mb-4">日報カレンダー ({selectedMonth})</h3>
                            <div className="grid grid-cols-7 gap-px bg-slate-200 border rounded-lg overflow-hidden">
                                {['日','月','火','水','木','金','土'].map(d=><div key={d} className="bg-slate-100 p-2 text-center text-xs font-bold">{d}</div>)}
                                {Array.from({length: 31}).map((_, i) => (
                                    <div key={i} onClick={()=>{setReportDate(`${selectedYear}-...-${i+1}`); setIsInputModalOpen(true);}} className="bg-white h-24 p-2 border-t hover:bg-blue-50 cursor-pointer">
                                        <span className="text-sm font-bold">{i+1}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Modal */}
                {isInputModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl p-6 w-96 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold">日報入力 ({reportDate})</h3>
                                <X className="cursor-pointer" onClick={()=>setIsInputModalOpen(false)}/>
                            </div>
                            <div className="space-y-4">
                                <div><label className="text-xs font-bold text-slate-500">門配 (枚)</label><input type="number" className="w-full border rounded-lg p-2" value={dailyReportInput.flyers} onChange={e=>setDailyReportInput({...dailyReportInput, flyers:Number(e.target.value)})}/></div>
                                <div><label className="text-xs font-bold text-slate-500">体験会実施数 (実績)</label><input type="number" className="w-full border rounded-lg p-2" value={dailyReportInput.trialLessons} onChange={e=>setDailyReportInput({...dailyReportInput, trialLessons:Number(e.target.value)})}/></div>
                                <button onClick={handleSaveDailyReport} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold">保存する</button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<RobotSchoolDashboard />);
