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

let db = null;
let isFirebaseInitialized = false;
try {
    if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_API_KEY") {
        const app = initializeApp(FIREBASE_CONFIG);
        db = getFirestore(app);
        isFirebaseInitialized = true;
    }
} catch (e) { console.error(e); }

// ==========================================
// Helper Functions
// ==========================================
const normalizeString = (str) => {
    if (!str) return "";
    return str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
};

const parseDate = (dateValue) => {
    if (!dateValue) return null;
    if (typeof dateValue.toDate === 'function') return dateValue.toDate();
    if (dateValue.seconds) return new Date(dateValue.seconds * 1000);
    if (typeof dateValue === 'string') {
        let d = new Date(dateValue);
        if (!isNaN(d.getTime())) return d;
        // 日本語形式のパース (2026年1月24日...)
        const jpDateMatch = dateValue.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (jpDateMatch) {
            return new Date(parseInt(jpDateMatch[1], 10), parseInt(jpDateMatch[2], 10) - 1, parseInt(jpDateMatch[3], 10));
        }
    }
    return null;
};

const formatDateStr = (date) => {
    if (!date) return "";
    return `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;
};

const getFiscalYear = (date) => (date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear());

const getWeeksStruct = (fiscalYear, monthIndex) => {
    let targetYear = fiscalYear;
    let jsMonth = monthIndex + 3;
    if (jsMonth > 11) { jsMonth -= 12; targetYear += 1; }
    const daysInMonth = new Date(targetYear, jsMonth + 1, 0).getDate();
    const weeks = [];
    let startDay = 1;
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(targetYear, jsMonth, day);
        const dayOfWeek = dateObj.getDay();
        let isWeekEnd = (dayOfWeek === 0 && day !== 1) || day === daysInMonth;
        if (isWeekEnd) {
            weeks.push({ name: `第${weeks.length + 1}週 (${startDay}～${day})`, startDay, endDay: day });
            startDay = day + 1;
        }
    }
    return { weeks, daysInMonth, targetYear, jsMonth };
};

// UI Components
const StatCard = ({ title, value, subValue, icon: Icon, color, details }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${color}`}><Icon className="w-6 h-6 text-white" /></div>
        </div>
        <div className="mt-4 text-sm text-slate-400">{subValue}</div>
        {details && (
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

// Main Component
function RobotSchoolDashboard() {
    const today = new Date();
    const currentFiscalYear = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    const currentMonthStr = `${today.getMonth() + 1}月`;

    // State
    const [activeTab, setActiveTab] = useState('summary');
    const [selectedCampusId, setSelectedCampusId] = useState('All');
    const [isCampusMenuOpen, setIsCampusMenuOpen] = useState(true); // ★修正済み
    const [expandedCampusId, setExpandedCampusId] = useState(null);
    const [viewMode, setViewMode] = useState('monthly');
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [selectedYear, setSelectedYear] = useState(currentFiscalYear);

    const [campusList, setCampusList] = useState([]);
    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);
    const [realDailyReports, setRealDailyReports] = useState([]);
    const [realTrialApps, setRealTrialApps] = useState([]);

    const [rawDataMap, setRawDataMap] = useState(null);
    const [displayData, setDisplayData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    const [isSavingReport, setIsSavingReport] = useState(false);
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);
    const [reportDate, setReportDate] = useState(formatDateStr(new Date()));
    const [dailyReportInput, setDailyReportInput] = useState({ weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });
    const [planData, setPlanData] = useState(MONTHS_LIST.reduce((acc, m) => ({...acc, [m]: {enrollments:0, trials:0, touchTry:0, flyers:0, rate:0}}), {}));

    const selectedCampusName = useMemo(() => {
        if (selectedCampusId === 'All') return '全校舎 (合計)';
        const c = campusList.find(c => c.id === selectedCampusId);
        return c ? c.name : selectedCampusId;
    }, [selectedCampusId, campusList]);

    // Firebase Sync
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

            const data = {
                campuses: campusSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                enroll: enrollSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                status: statusSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                transfers: transferSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                reports: reportSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                trials: trialSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            };

            setCampusList(data.campuses);
            setRealEnrollments(data.enroll);
            setRealStatusChanges(data.status);
            setRealTransfers(data.transfers);
            setRealDailyReports(data.reports);
            setRealTrialApps(data.trials);
            
            const now = new Date();
            setLastUpdated(now);
            Object.entries(CACHE_KEYS).forEach(([k, key]) => {
                if (k !== 'LAST_UPDATED') localStorage.setItem(key, JSON.stringify(data[key.split('_')[1]] || data[key.split('_')[1]+'s'] || []));
            });
            localStorage.setItem(CACHE_KEYS.LAST_UPDATED, now.toISOString());
        } catch (e) { console.error(e); } finally { setIsSyncing(false); }
    };

    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            const cachedTime = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);
            if (cachedTime) {
                try {
                    setCampusList(JSON.parse(localStorage.getItem(CACHE_KEYS.CAMPUSES)) || []);
                    setRealEnrollments(JSON.parse(localStorage.getItem(CACHE_KEYS.ENROLLMENTS)) || []);
                    setRealStatusChanges(JSON.parse(localStorage.getItem(CACHE_KEYS.STATUS)) || []);
                    setRealTransfers(JSON.parse(localStorage.getItem(CACHE_KEYS.TRANSFERS)) || []);
                    setRealDailyReports(JSON.parse(localStorage.getItem(CACHE_KEYS.DAILY_REPORTS)) || []);
                    setRealTrialApps(JSON.parse(localStorage.getItem(CACHE_KEYS.TRIAL_APPS)) || []);
                    setLastUpdated(new Date(cachedTime));
                } catch(e) { await fetchFromFirebaseAndCache(); }
            } else { await fetchFromFirebaseAndCache(); }
            setIsLoading(false);
        };
        init();
    }, []);

    // 集計ロジック (統合版)
    const calculateData = () => {
        const dataMap = {};
        const sheetToId = {};
        campusList.forEach(c => { sheetToId[c.sheetName || c.name] = c.id; sheetToId[normalizeString(c.sheetName || c.name)] = c.id; });

        const reportLookup = {};
        realDailyReports.forEach(r => { if(r.campusId && r.date) reportLookup[`${r.campusId}_${r.date}`] = r; });

        campusList.forEach(campusObj => {
            const campusId = campusObj.id;
            let currentStudents = 0;

            const filterBefore = (list, typeFilter = null) => list.filter(item => {
                const cKey = sheetToId[item.campus] || sheetToId[normalizeString(item.campus)];
                if (cKey !== campusId) return false;
                const d = parseDate(item.date);
                if (!d || getFiscalYear(d) >= selectedYear) return false;
                if (typeFilter && (!item.type || !item.type.includes(typeFilter))) return false;
                return true;
            }).length;

            currentStudents = (filterBefore(realEnrollments) + filterBefore(realTransfers)) - (filterBefore(realStatusChanges, "退会") + filterBefore(realStatusChanges, "転校") + filterBefore(realStatusChanges, "卒業"));

            dataMap[campusId] = MONTHS_LIST.map((month, mIdx) => {
                const { weeks, daysInMonth, targetYear: tYear, jsMonth: tMonth } = getWeeksStruct(selectedYear, mIdx);
                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const dayNum = dIdx + 1;
                    const dateStr = `${tYear}-${('0'+(tMonth+1)).slice(-2)}-${('0'+dayNum).slice(-2)}`;
                    const report = reportLookup[`${campusId}_${dateStr}`] || {};

                    let tApp = 0, eApp = 0, tExec = 0, eExec = 0;
                    realTrialApps.forEach(app => {
                        const cKey = sheetToId[app.campus] || sheetToId[normalizeString(app.campus)];
                        if (cKey !== campusId) return;
                        const isEvent = app.type && app.type.includes('イベント');
                        const aD = parseDate(app.date); if (aD && formatDateStr(aD) === dateStr) { if(isEvent) eApp++; else tApp++; }
                        const eD = parseDate(app.trialDate); if (eD && formatDateStr(eD) === dateStr) { if(isEvent) eExec++; else tExec++; }
                    });

                    const countEvent = (list, type = null) => list.filter(i => {
                        const cK = sheetToId[i.campus] || sheetToId[normalizeString(i.campus)];
                        const d = parseDate(i.date);
                        return cK === campusId && d && formatDateStr(d) === dateStr && (!type || (i.type && i.type.includes(type)));
                    }).length;

                    const dEnr = countEvent(realEnrollments); const dTrIn = countEvent(realTransfers);
                    const dWith = countEvent(realStatusChanges, "退会"); const dTrOut = countEvent(realStatusChanges, "転校");
                    const dGrad = countEvent(realStatusChanges, "卒業"); const dRec = countEvent(realStatusChanges, "休会");

                    return {
                        name: `${dayNum}日`, newEnrollments: dEnr, transferIns: dTrIn, withdrawals: dWith, recesses: dRec, transfers: dTrOut, graduates: dGrad,
                        flyers: report.flyers || 0, touchAndTry: report.touchTry || 0, trialApp: tApp, eventApp: eApp, trialExec: tExec, eventExec: eExec,
                        totalStudents: currentStudents, withdrawals_neg: -dWith, recesses_neg: -dRec, transfers_neg: -dTrOut, graduates_neg: -dGrad
                    };
                });

                const mSum = (key) => daily.reduce((a, b) => a + (b[key] || 0), 0);
                const weekly = weeks.map(w => {
                    const slice = daily.slice(w.startDay - 1, w.endDay);
                    const wSum = (k) => slice.reduce((a, b) => a + (b[k] || 0), 0);
                    return { name: w.name, ...Object.fromEntries(Object.keys(daily[0]).filter(k => k!=='name').map(k => [k, wSum(k)])) };
                });

                const net = (mSum('newEnrollments') + mSum('transferIns')) - (mSum('withdrawals') + mSum('transfers') + mSum('graduates'));
                currentStudents += net;
                return { name: month, ...Object.fromEntries(Object.keys(daily[0]).filter(k => k!=='name').map(k => [k, mSum(k)])), totalStudents: currentStudents, daily, weekly };
            });
        });

        dataMap['All'] = MONTHS_LIST.map((m, idx) => {
            const { weeks, daysInMonth } = getWeeksStruct(selectedYear, idx);
            const comb = { name: m, newEnrollments:0, transferIns:0, withdrawals:0, recesses:0, returns:0, transfers:0, graduates:0, totalStudents:0, flyers:0, touchAndTry:0, trialApp:0, eventApp:0, trialExec:0, eventExec:0, withdrawals_neg:0, recesses_neg:0, transfers_neg:0, graduates_neg:0, daily: Array.from({length:daysInMonth}, (_,i)=>({name:`${i+1}日`, newEnrollments:0, transferIns:0, withdrawals:0, recesses:0, transfers:0, graduates:0, flyers:0, touchAndTry:0, trialApp:0, eventApp:0, trialExec:0, eventExec:0, withdrawals_neg:0, recesses_neg:0, transfers_neg:0, graduates_neg:0})), weekly: weeks.map(w=>({name:w.name, newEnrollments:0, transferIns:0, withdrawals:0, recesses:0, transfers:0, graduates:0, flyers:0, touchAndTry:0, trialApp:0, eventApp:0, trialExec:0, eventExec:0, withdrawals_neg:0, recesses_neg:0, transfers_neg:0, graduates_neg:0})) };
            campusList.forEach(c => {
                const d = dataMap[c.id]?.[idx];
                if (d) {
                    Object.keys(comb).forEach(k => { if(typeof comb[k]==='number') comb[k] += d[k]; });
                    d.daily.forEach((day, i) => { if(comb.daily[i]) Object.keys(day).forEach(k => { if(typeof day[k]==='number' && k!=='name') comb.daily[i][k] += day[k]; })});
                    d.weekly.forEach((wk, i) => { if(comb.weekly[i]) Object.keys(wk).forEach(k => { if(typeof wk[k]==='number' && k!=='name') comb.weekly[i][k] += wk[k]; })});
                }
            });
            return comb;
        });
        return dataMap;
    };

    useEffect(() => {
        if (campusList.length) {
            const map = calculateData();
            setRawDataMap(map);
        }
    }, [campusList, realEnrollments, realStatusChanges, realTrialApps, realDailyReports, selectedYear]);

    useEffect(() => {
        if (rawDataMap) {
            const data = rawDataMap[selectedCampusId] || [];
            if (viewMode === 'annual') setDisplayData(data);
            else {
                const mData = data.find(d => d.name === selectedMonth);
                setDisplayData(mData ? (viewMode === 'monthly' ? mData.daily : mData.weekly) : []);
            }
        }
    }, [selectedCampusId, viewMode, selectedMonth, rawDataMap]);

    const totals = useMemo(() => {
        const init = { newEnrollments:0, returns:0, transferIns:0, withdrawals:0, graduates:0, transfers:0, recesses:0, flyers:0, touchAndTry:0, trialApp:0, eventApp:0, trialExec:0, eventExec:0 };
        return displayData.reduce((acc, curr) => { Object.keys(acc).forEach(k => acc[k] += (curr[k] || 0)); return acc; }, init);
    }, [displayData]);

    const currentTotalStudents = displayData.length ? (viewMode==='annual' ? displayData[displayData.length-1].totalStudents : displayData[0].totalStudents) : 0;

    // Handlers
    const handleSaveDailyReport = async () => {
        if (selectedCampusId === 'All') return;
        setIsSavingReport(true);
        try {
            await setDoc(doc(db, "daily_reports", `${selectedCampusId}_${reportDate}`), { campusId: selectedCampusId, date: reportDate, ...dailyReportInput, updatedAt: serverTimestamp() });
            await fetchFromFirebaseAndCache();
            setIsInputModalOpen(false);
        } catch(e) { alert(e.message); } finally { setIsSavingReport(false); }
    };

    const savePlanData = async () => {
        setIsSavingPlan(true);
        try {
            await setDoc(doc(db, "campus_plans", `${selectedCampusId}_${selectedYear}`), { campusId: selectedCampusId, year: selectedYear, plans: planData, updatedAt: serverTimestamp() });
            alert("保存完了");
        } catch(e) { alert(e.message); } finally { setIsSavingPlan(false); }
    };

    const renderCalendar = () => {
        const mIdx = MONTHS_LIST.indexOf(selectedMonth);
        let tY = selectedYear; let jsM = mIdx + 3; if (jsM > 11) { jsM -= 12; tY += 1; }
        const firstDay = new Date(tY, jsM, 1).getDay();
        const daysInMonth = new Date(tY, jsM + 1, 0).getDate();
        const wMap = { sunny: { i: Sun, c: 'text-orange-500' }, cloudy: { i: Cloud, c: 'text-gray-500' }, rainy: { i: CloudRain, c: 'text-blue-500' }, snowy: { i: Snowflake, c: 'text-cyan-500' }, closed: { i: Ban, c: 'text-rose-500' } };
        const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`b-${i}`} className="h-24 bg-slate-50 border border-slate-100"></div>);
        const days = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dS = `${tY}-${('0'+(jsM+1)).slice(-2)}-${('0'+day).slice(-2)}`;
            const r = realDailyReports.find(rep => rep.campusId === selectedCampusId && rep.date === dS);
            return (
                <div key={day} onClick={() => { setReportDate(dS); setDailyReportInput(r || {weather:'sunny',touchTry:0,flyers:0,trialLessons:0}); setIsInputModalOpen(true); }} className={`h-24 border border-slate-200 p-1.5 cursor-pointer hover:bg-blue-50 transition-all flex flex-col ${r?.weather === 'closed' ? 'bg-slate-100' : 'bg-white'}`}>
                    <div className="flex justify-between items-start mb-1"><span className="text-sm font-bold text-slate-700">{day}</span>{r && wMap[r.weather] && React.createElement(wMap[r.weather].i, { className: `w-4 h-4 ${wMap[r.weather].c}` })}</div>
                    {r && r.weather !== 'closed' ? (
                        <div className="flex-1 flex flex-col justify-end gap-0.5 text-[10px] text-slate-500">
                            <div className="bg-slate-50 px-1 rounded flex justify-between"><span>門配</span><b>{r.flyers}</b></div>
                            <div className="bg-slate-50 px-1 rounded flex justify-between"><span>T&T</span><b>{r.touchTry}</b></div>
                        </div>
                    ) : r?.weather === 'closed' ? <div className="flex-1 flex items-center justify-center text-[10px] font-bold text-slate-400">休校</div> : null}
                </div>
            );
        });
        return [...blanks, ...days];
    };

    if (isLoading && !rawDataMap) return <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500"><Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-600" /><p>Loading Dashboard...</p></div>;

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 overflow-y-auto">
                <div className="p-6 border-b border-slate-800 flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-white" /></div>
                    <span className="text-lg font-bold tracking-tight">RobotSchoolDash</span>
                </div>
                <nav className="flex-1 py-4 px-3 space-y-1">
                    <button onClick={() => {setActiveTab('summary'); setSelectedCampusId('All');}} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg ${activeTab === 'summary' ? 'bg-blue-600' : 'text-slate-400 hover:bg-slate-800'}`}><LayoutDashboard className="w-5 h-5" /><span>経営サマリー</span></button>
                    <button onClick={() => setActiveTab('students')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg ${activeTab === 'students' ? 'bg-blue-600' : 'text-slate-400 hover:bg-slate-800'}`}><Users className="w-5 h-5" /><span>生徒管理</span></button>
                    <button onClick={() => setActiveTab('marketing')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg ${activeTab === 'marketing' ? 'bg-blue-600' : 'text-slate-400 hover:bg-slate-800'}`}><Megaphone className="w-5 h-5" /><span>集客・販促</span></button>
                    
                    <div className="pt-4 pb-2 px-3 text-xs font-semibold text-slate-500 uppercase flex justify-between items-center cursor-pointer" onClick={() => setIsCampusMenuOpen(!isCampusMenuOpen)}>
                        <span>校舎管理</span><ChevronDown className={`w-4 h-4 transition-transform ${isCampusMenuOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {isCampusMenuOpen && (
                        <div className="space-y-1">
                            <button onClick={() => setActiveTab('settings')} className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 rounded-lg"><Plus className="w-4 h-4" /><span>校舎追加</span></button>
                            {campusList.map(c => (
                                <div key={c.id} className="ml-2">
                                    <button onClick={() => setExpandedCampusId(expandedCampusId === c.id ? null : c.id)} className={`w-full flex items-center justify-between px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 rounded-lg ${expandedCampusId === c.id ? 'bg-slate-800 text-white' : ''}`}><div className="flex items-center"><Building className="w-4 h-4 mr-2" />{c.name}</div><ChevronRight className={`w-3 h-3 transition-transform ${expandedCampusId === c.id ? 'rotate-90' : ''}`} /></button>
                                    {expandedCampusId === c.id && (
                                        <div className="ml-4 pl-2 border-l border-slate-700 mt-1 space-y-1">
                                            <button onClick={() => {setActiveTab('campus_daily'); setSelectedCampusId(c.id);}} className={`w-full text-left px-3 py-1.5 text-xs rounded ${activeTab==='campus_daily'&&selectedCampusId===c.id?'text-blue-400 font-bold':'text-slate-500'}`}>└ 日報入力</button>
                                            <button onClick={() => {setActiveTab('campus_yearly'); setSelectedCampusId(c.id);}} className={`w-full text-left px-3 py-1.5 text-xs rounded ${activeTab==='campus_yearly'&&selectedCampusId===c.id?'text-blue-400 font-bold':'text-slate-500'}`}>└ 年間計画入力</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500">更新: {lastUpdated?.toLocaleTimeString()}</div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                <header className="bg-white border-b h-16 flex items-center justify-between px-6 shrink-0">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{{summary:'経営サマリー', students:'生徒数・入退会管理', marketing:'集客活動・販促管理', campus_daily:'日報入力', campus_yearly:'年間計画入力', settings:'校舎設定'}[activeTab]}</h1>
                        <p className="text-[10px] text-slate-500 flex items-center">{selectedCampusId !== 'All' ? <><Building className="w-3 h-3 mr-1" />{selectedCampusName}</> : '全校舎合計'}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                        <select value={selectedYear} onChange={e=>setSelectedYear(Number(e.target.value))} className="bg-slate-100 rounded-lg text-sm px-3 py-1 font-medium">{YEARS_LIST.map(y=><option key={y} value={y}>{y}年度</option>)}</select>
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            {[{k:'annual',l:'年度'},{k:'monthly',l:'月度'},{k:'weekly',l:'週次'}].map(m=><button key={m.k} onClick={()=>setViewMode(m.k)} className={`px-3 py-1 text-xs rounded ${viewMode===m.k?'bg-white text-blue-600 shadow-sm':'text-slate-500'}`}>{m.l}</button>)}
                        </div>
                        {viewMode !== 'annual' && <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="bg-slate-100 rounded-lg text-sm px-3 py-1 font-medium">{MONTHS_LIST.map(m=><option key={m} value={m}>{m}</option>)}</select>}
                        <select value={selectedCampusId} onChange={e=>setSelectedCampusId(e.target.value)} className="bg-slate-100 rounded-lg text-sm px-3 py-1 font-bold"><option value="All">全校舎合計</option>{campusList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <button onClick={fetchFromFirebaseAndCache} disabled={isSyncing} className="p-2 rounded-lg border hover:bg-slate-50"><RefreshCw className={`w-4 h-4 ${isSyncing?'animate-spin':''}`} /></button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {activeTab === 'summary' && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatCard title="生徒数" value={`${currentTotalStudents}名`} subValue="当期末時点" icon={Users} color="bg-indigo-500" />
                                <StatCard title="門配累計" value={`${totals.flyers}枚`} subValue="選択期間" icon={Megaphone} color="bg-orange-500" />
                                <StatCard title="体験会申込" value={`${totals.trialApp + totals.eventApp}名`} subValue="累計" icon={Calendar} color="bg-blue-500" />
                                <StatCard title="入会数" value={`${totals.newEnrollments}名`} subValue="新規" icon={Activity} color="bg-emerald-500" />
                            </div>
                        )}

                        {activeTab === 'students' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <StatCard title="増加数" value={`${totals.newEnrollments + totals.transferIns}名`} subValue="入会+転入" icon={Users} color="bg-emerald-500" details={[{label:'入会', value:totals.newEnrollments},{label:'復会', value:totals.returns}]} />
                                    <StatCard title="減少数" value={`${totals.withdrawals + totals.transfers + totals.graduates}名`} subValue="退会+転校+卒業" icon={Users} color="bg-rose-500" details={[{label:'退会', value:totals.withdrawals},{label:'休会', value:totals.recesses}]} />
                                    <StatCard title="純増数" value={`${(totals.newEnrollments + totals.transferIns) - (totals.withdrawals + totals.transfers + totals.graduates)}名`} subValue="純増減" icon={TrendingUp} color="bg-blue-500" />
                                    <StatCard title="在籍数" value={`${currentTotalStudents}名`} subValue="現在" icon={School} color="bg-indigo-500" />
                                </div>
                                <div className="bg-white p-6 rounded-xl border h-[400px]">
                                    <h3 className="font-bold mb-4">生徒数増減フロー</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={displayData} stackOffset="sign">
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" />
                                            <YAxis padding={{top:20, bottom:20}} domain={['auto','auto']} />
                                            <Tooltip /><Legend /><ReferenceLine y={0} stroke="#000" />
                                            <Bar dataKey="newEnrollments" name="入会" fill="#10b981" stackId="s" />
                                            <Bar dataKey="transferIns" name="転入" fill="#06b6d4" stackId="s" />
                                            <Bar dataKey="withdrawals_neg" name="退会" fill="#ef4444" stackId="s" />
                                            <Bar dataKey="transfers_neg" name="転校" fill="#f97316" stackId="s" />
                                            <Bar dataKey="graduates_neg" name="卒業" fill="#a855f7" stackId="s" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {activeTab === 'marketing' && (
                            <div className="bg-white p-6 rounded-xl border h-[500px]">
                                <h3 className="font-bold mb-4">集客・販促ファネル</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={displayData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis yAxisId="L" /><YAxis yAxisId="R" orientation="right" />
                                        <Tooltip /><Legend />
                                        <Bar yAxisId="L" dataKey="flyers" name="門配" fill="#94a3b8" />
                                        <Bar yAxisId="L" dataKey="trialApp" name="体験申込" stackId="app" fill="#3b82f6" />
                                        <Bar yAxisId="L" dataKey="eventApp" name="イベント申込" stackId="app" fill="#93c5fd" />
                                        <Bar yAxisId="L" dataKey="trialExec" name="体験実施" stackId="exe" fill="#f97316" />
                                        <Bar yAxisId="L" dataKey="eventExec" name="イベント実施" stackId="exe" fill="#fdba74" />
                                        <Line yAxisId="R" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {activeTab === 'campus_daily' && (
                            <div className="bg-white p-6 rounded-xl border">
                                <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                                    {['日','月','火','水','木','金','土'].map((d,i)=><div key={d} className={`p-2 text-center text-xs font-bold ${i===0?'text-red-500':i===6?'text-blue-500':'text-slate-600'} bg-slate-100`}>{d}</div>)}
                                    {renderCalendar()}
                                </div>
                            </div>
                        )}

                        {activeTab === 'campus_yearly' && (
                            <div className="bg-white p-6 rounded-xl border">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold">年間計画入力</h3>
                                    <button onClick={savePlanData} disabled={isSavingPlan} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center"><Save className="w-4 h-4 mr-2" />保存</button>
                                </div>
                                <table className="w-full text-sm">
                                    <thead><tr className="bg-slate-50 border-b"><th>月</th><th>入会目標</th><th>体験目標</th><th>門配目標</th></tr></thead>
                                    <tbody>
                                        {MONTHS_LIST.map(m => (
                                            <tr key={m} className="border-b">
                                                <td className="p-2 font-bold">{m}</td>
                                                {['enrollments','trials','flyers'].map(f => (
                                                    <td key={f} className="p-1"><input type="number" className="w-full border p-1 text-right" value={planData[m]?.[f] || 0} onChange={e => handlePlanChange(m, f, e.target.value)} /></td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="bg-white p-8 rounded-xl border">
                                <h3 className="font-bold mb-4">校舎追加</h3>
                                <div className="flex gap-4 items-end mb-8">
                                    <div className="flex-1"><label className="text-xs block mb-1">ID</label><input className="border w-full p-2 rounded" value={newCampusId} onChange={e=>setNewCampusId(e.target.value)} /></div>
                                    <div className="flex-1"><label className="text-xs block mb-1">校舎名</label><input className="border w-full p-2 rounded" value={newCampusName} onChange={e=>setNewCampusName(e.target.value)} /></div>
                                    <button onClick={handleAddCampus} className="bg-blue-600 text-white px-6 py-2 rounded h-10">登録</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {campusList.map(c => (<div key={c.id} className="p-4 bg-slate-50 rounded border flex justify-between items-center"><div><b>{c.name}</b><br/><span className="text-[10px] text-slate-400">ID: {c.id}</span></div><button onClick={()=>handleDeleteCampus(c.id, c.name)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div>))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Daily Report Modal */}
                {isInputModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-in zoom-in-95">
                            <div className="flex justify-between items-center p-4 border-b">
                                <h3 className="font-bold">日報入力 ({reportDate})</h3>
                                <button onClick={()=>setIsInputModalOpen(false)}><X /></button>
                            </div>
                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-5 gap-2">
                                    {[{id:'sunny',i:Sun,c:'text-orange-500'},{id:'cloudy',i:Cloud,c:'text-gray-500'},{id:'rainy',i:CloudRain,c:'text-blue-500'},{id:'snowy',i:Snowflake,c:'text-cyan-500'},{id:'closed',i:Ban,c:'text-red-500'}].map(w=>(
                                        <button key={w.id} onClick={()=>handleWeatherSelect(w.id)} className={`flex flex-col items-center p-2 border rounded-lg ${dailyReportInput.weather===w.id?'bg-blue-50 border-blue-500 ring-2':'hover:bg-slate-50'}`}><w.i className={`w-5 h-5 ${w.c}`} /></button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {['flyers','touchTry'].map(f => (
                                        <div key={f}><label className="text-xs font-bold block mb-1">{f==='flyers'?'門配':'T&T'}</label><input type="number" disabled={dailyReportInput.weather==='closed'} className="border w-full p-2 text-right" value={dailyReportInput[f]} onChange={e=>setDailyReportInput({...dailyReportInput,[f]:Number(e.target.value)})} /></div>
                                    ))}
                                </div>
                                <button onClick={handleSaveDailyReport} disabled={isSavingReport} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">保存</button>
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
