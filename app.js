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

const DEFAULT_CAMPUS_LIST = [];
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
    return str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
};

// ★ 表記ゆれ吸収ロジック
const findCampusId = (inputName, campusList) => {
    if (!inputName) return null;
    const normInput = normalizeString(inputName);
    // 1. ID完全一致
    let match = campusList.find(c => c.id === inputName);
    if (match) return match.id;
    // 2. 名称・連携名完全一致
    match = campusList.find(c => normalizeString(c.name) === normInput || normalizeString(c.sheetName) === normInput);
    if (match) return match.id;
    // 3. 部分一致 (登録名が入力データの中に含まれているか)
    match = campusList.find(c => {
        const cName = normalizeString(c.name);
        const cSheet = normalizeString(c.sheetName || c.name);
        return (cName && normInput.includes(cName)) || (cSheet && normInput.includes(cSheet));
    });
    return match ? match.id : null;
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

    const [campusList, setCampusList] = useState(DEFAULT_CAMPUS_LIST);
    const [newCampusName, setNewCampusName] = useState("");
    const [newCampusId, setNewCampusId] = useState("");
    const [newCampusSheetName, setNewCampusSheetName] = useState("");
    
    // Daily Report State
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

    // Cache logic
    const loadFromCache = () => {
        try {
            const cachedCampuses = localStorage.getItem(CACHE_KEYS.CAMPUSES);
            if (cachedCampuses) {
                setCampusList(JSON.parse(cachedCampuses));
                setRealEnrollments(JSON.parse(localStorage.getItem(CACHE_KEYS.ENROLLMENTS) || "[]"));
                setRealStatusChanges(JSON.parse(localStorage.getItem(CACHE_KEYS.STATUS) || "[]"));
                setRealTransfers(JSON.parse(localStorage.getItem(CACHE_KEYS.TRANSFERS) || "[]"));
                setRealDailyReports(JSON.parse(localStorage.getItem(CACHE_KEYS.DAILY_REPORTS) || "[]"));
                setRealTrialApps(JSON.parse(localStorage.getItem(CACHE_KEYS.TRIAL_APPS) || "[]"));
                const time = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);
                if (time) setLastUpdated(new Date(time));
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
            const enrollments = enrollSnap.docs.map(d => d.data());
            const status = statusSnap.docs.map(d => d.data());
            const transfers = transferSnap.docs.map(d => d.data());
            const reports = reportSnap.docs.map(d => d.data());
            const trialApps = trialSnap.docs.map(d => d.data());
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

    // 計画データ取得
    useEffect(() => {
        const fetchPlan = async () => {
            if (selectedCampusId === 'All' || !isFirebaseInitialized || !db) {
                setPlanData(createInitialPlanData());
                return;
            }
            try {
                const docRef = doc(db, "campus_plans", `${selectedCampusId}_${selectedYear}`);
                const docSnap = await getDoc(docRef);
                setPlanData(docSnap.exists() ? docSnap.data().plans : createInitialPlanData());
            } catch (e) { console.error(e); }
        };
        fetchPlan();
    }, [selectedCampusId, selectedYear]);

    // 集計コアロジック
    const generateAllCampusesData = (targetCampuses, realEnrollmentList, realStatusList, realTransferList, dailyReportsList, trialAppsList, targetYear) => {
        const dataMap = {};
        
        // ★修正: 表記ゆれを考慮して正しいキャンパスIDを取得
        const getResolvedCampusId = (rawName) => findCampusId(rawName, targetCampuses);

        // 体験会データの校舎別マッピング (予約数集計用)
        const trialDataByCampus = {};
        trialAppsList.forEach(app => {
            const cid = getResolvedCampusId(app.campus);
            if (cid) {
                if (!trialDataByCampus[cid]) trialDataByCampus[cid] = [];
                trialDataByCampus[cid].push(app);
            }
        });

        // 日報のマッピング (実施数・門配・T&T集計用)
        const reportMap = {};
        dailyReportsList.forEach(r => {
            const cid = getResolvedCampusId(r.campusId);
            if (cid && r.date) reportMap[`${cid}_${r.date}`] = r;
        });

        const countEvents = (list, typeFilter = null) => {
            const counts = {};
            list.forEach(item => {
                const dateObj = parseDate(item.date);
                if (!dateObj || getFiscalYear(dateObj) !== targetYear) return;
                if (typeFilter && (!item.type || !item.type.includes(typeFilter))) return;
                
                const cid = getResolvedCampusId(item.campus);
                if (!cid) return;

                const monthIdx = (dateObj.getMonth() + 9) % 12;
                const day = dateObj.getDate();
                if (!counts[cid]) counts[cid] = Array.from({length:12}, () => ({ total: 0, days: {} }));
                counts[cid][monthIdx].total++;
                counts[cid][monthIdx].days[day] = (counts[cid][monthIdx].days[day] || 0) + 1;
            });
            return counts;
        };

        const enrC = countEvents(realEnrollmentList);
        const tInC = countEvents(realTransferList);
        const wdrC = countEvents(realStatusList, "退会");
        const recC = countEvents(realStatusList, "休会");
        const retC = countEvents(realStatusList, "復会");
        const tOutC = countEvents(realStatusList, "転校");
        const gradC = countEvents(realStatusList, "卒業");

        targetCampuses.forEach(campusObj => {
            const cid = campusObj.id;
            let currentStudents = 0;
            const myTrialApps = trialDataByCampus[cid] || [];

            dataMap[cid] = MONTHS_LIST.map((month, mIdx) => {
                const { weeks, daysInMonth, targetYear: tYear, jsMonth: tMonth } = getWeeksStruct(targetYear, mIdx);

                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const dayNum = dIdx + 1;
                    const dateStr = `${tYear}-${('0'+(tMonth+1)).slice(-2)}-${('0'+dayNum).slice(-2)}`;
                    const report = reportMap[`${cid}_${dateStr}`] || {};

                    // 予約数集計 (申込日基準)
                    let dTrialApp = 0, dEventApp = 0;
                    myTrialApps.forEach(app => {
                        const isEvent = app.type && app.type.includes('イベント');
                        const appDate = parseDate(app.date);
                        if (appDate && formatDateStr(appDate) === dateStr) {
                            if (isEvent) dEventApp++; else dTrialApp++;
                        }
                    });

                    // ★修正: 実施数は日報の値を正とする
                    const dTrialExec = report.trialLessons || 0;
                    const dEventExec = 0; // 日報にイベント個別の項目がない場合は0

                    const dEnr = enrC[cid]?.[mIdx]?.days[dayNum] || 0;
                    const dWdr = wdrC[cid]?.[mIdx]?.days[dayNum] || 0;
                    const dRec = recC[cid]?.[mIdx]?.days[dayNum] || 0;
                    const dTOut = tOutC[cid]?.[mIdx]?.days[dayNum] || 0;
                    const dGrad = gradC[cid]?.[mIdx]?.days[dayNum] || 0;

                    return {
                        name: `${dayNum}日`,
                        newEnrollments: dEnr,
                        transferIns: tInC[cid]?.[mIdx]?.days[dayNum] || 0,
                        withdrawals: dWdr,
                        recesses: dRec,
                        returns: retC[cid]?.[mIdx]?.days[dayNum] || 0,
                        transfers: dTOut,
                        graduates: dGrad,
                        flyers: report.flyers || 0,
                        touchAndTry: report.touchTry || 0,
                        trialLessons: report.trialLessons || 0,
                        trialApp: dTrialApp,
                        eventApp: dEventApp,
                        trialExec: dTrialExec,
                        eventExec: dEventExec,
                        withdrawals_neg: -dWdr,
                        recesses_neg: -dRec,
                        transfers_neg: -dTOut,
                        graduates_neg: -dGrad
                    };
                });

                const mSum = daily.reduce((acc, d) => {
                    Object.keys(acc).forEach(k => { if (typeof acc[k] === 'number' && k !== 'totalStudents') acc[k] += d[k]; });
                    return acc;
                }, { name: month, newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0, flyers: 0, touchAndTry: 0, trialLessons: 0, trialApp: 0, trialExec: 0, eventApp: 0, eventExec: 0, withdrawals_neg: 0, recesses_neg: 0, transfers_neg: 0, graduates_neg: 0 });

                currentStudents += (mSum.newEnrollments + mSum.transferIns) - (mSum.withdrawals + mSum.transfers + mSum.graduates);
                mSum.totalStudents = currentStudents;
                mSum.daily = daily;
                
                mSum.weekly = weeks.map(w => {
                    const wData = daily.slice(w.startDay - 1, w.endDay);
                    return wData.reduce((acc, d) => {
                        Object.keys(acc).forEach(k => { if (typeof acc[k] === 'number' && k !== 'name') acc[k] += d[k]; });
                        return acc;
                    }, { name: w.name, newEnrollments:0, transferIns:0, withdrawals:0, recesses:0, returns:0, transfers:0, graduates:0, flyers:0, touchAndTry:0, trialApp:0, trialExec:0, eventApp:0, eventExec:0, withdrawals_neg:0, recesses_neg:0, transfers_neg:0, graduates_neg:0 });
                });
                return mSum;
            });
        });

        // 全校舎合計
        dataMap['All'] = MONTHS_LIST.map((month, idx) => {
            const combined = { name: month, newEnrollments:0, transferIns:0, withdrawals:0, recesses:0, returns:0, transfers:0, graduates:0, flyers:0, touchAndTry:0, trialLessons:0, trialApp:0, trialExec:0, eventApp:0, eventExec:0, totalStudents:0, withdrawals_neg:0, recesses_neg:0, transfers_neg:0, graduates_neg:0 };
            targetCampuses.forEach(c => {
                const d = dataMap[c.id][idx];
                Object.keys(combined).forEach(k => { if (typeof combined[k] === 'number') combined[k] += d[k]; });
            });
            // daily/weeklyマージ
            const sample = dataMap[targetCampuses[0].id][idx];
            combined.daily = sample.daily.map((d, i) => {
                const dayTotal = {...d};
                targetCampuses.slice(1).forEach(c => {
                    const other = dataMap[c.id][idx].daily[i];
                    Object.keys(dayTotal).forEach(k => { if(typeof dayTotal[k] === 'number' && k!=='name') dayTotal[k] += other[k]; });
                });
                return dayTotal;
            });
            combined.weekly = sample.weekly.map((w, i) => {
                const weekTotal = {...w};
                targetCampuses.slice(1).forEach(c => {
                    const other = dataMap[c.id][idx].weekly[i];
                    Object.keys(weekTotal).forEach(k => { if(typeof weekTotal[k] === 'number' && k!=='name') weekTotal[k] += other[k]; });
                });
                return weekTotal;
            });
            return combined;
        });
        return dataMap;
    };

    useEffect(() => {
        const generateData = async () => {
            if (campusList.length > 0) {
                setIsLoading(true);
                const map = generateAllCampusesData(campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, selectedYear);
                setRawDataMap(map);
                setIsLoading(false);
            }
        };
        generateData();
    }, [campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, selectedYear]);

    // 表示データ抽出
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

    const totals = useMemo(() => {
        if (!displayData || displayData.length === 0) return { newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0, flyers: 0, touchAndTry: 0, trialApp: 0, eventApp: 0, trialExec: 0, eventExec: 0, trialLessons: 0 };
        return displayData.reduce((acc, curr) => ({
            newEnrollments: acc.newEnrollments + (curr.newEnrollments || 0),
            transferIns: acc.transferIns + (curr.transferIns || 0),
            withdrawals: acc.withdrawals + (curr.withdrawals || 0),
            recesses: acc.recesses + (curr.recesses || 0),
            returns: acc.returns + (curr.returns || 0),
            transfers: acc.transfers + (curr.transfers || 0),
            graduates: acc.graduates + (curr.graduates || 0),
            flyers: acc.flyers + (curr.flyers || 0),
            touchAndTry: acc.touchAndTry + (curr.touchAndTry || 0),
            trialApp: acc.trialApp + (curr.trialApp || 0),
            eventApp: acc.eventApp + (curr.eventApp || 0),
            trialExec: acc.trialExec + (curr.trialExec || 0),
            eventExec: acc.eventExec + (curr.eventExec || 0),
            trialLessons: acc.trialLessons + (curr.trialLessons || 0),
        }), { newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0, flyers: 0, touchAndTry: 0, trialApp: 0, eventApp: 0, trialExec: 0, eventExec: 0, trialLessons: 0 });
    }, [displayData]);

    const currentTotalStudents = displayData.length > 0 ? (viewMode === 'annual' ? displayData[displayData.length-1].totalStudents : displayData[0].totalStudents) : 0;
    const viewModeLabel = { 'annual': '年度', 'monthly': `月度 (${selectedMonth})`, 'weekly': `週次 (${selectedMonth})` }[viewMode];

    // UI Handlers
    const handleAddCampus = async () => {
        if (!newCampusId || !newCampusName) return alert("校舎IDと校舎名は必須です。");
        await setDoc(doc(db, "campuses", newCampusId), { id: newCampusId, name: newCampusName, sheetName: newCampusSheetName || newCampusName, createdAt: serverTimestamp() });
        fetchFromFirebaseAndCache();
        setNewCampusId(""); setNewCampusName("");
    };

    const handleDeleteCampus = async (targetId, targetName) => {
        if (!confirm(`${targetName} を削除しますか？`)) return;
        await deleteDoc(doc(db, "campuses", targetId));
        fetchFromFirebaseAndCache();
    };

    const handlePlanChange = (month, field, value) => {
        setPlanData(prev => {
            const newData = { ...prev };
            newData[month] = { ...newData[month], [field]: Number(value) };
            if (field === 'enrollments' || field === 'trials') {
                const enr = field === 'enrollments' ? Number(value) : newData[month].enrollments;
                const tri = field === 'trials' ? Number(value) : newData[month].trials;
                newData[month].rate = tri > 0 ? ((enr / tri) * 100).toFixed(1) : 0;
            }
            return newData;
        });
    };

    const savePlanData = async () => {
        setIsSavingPlan(true);
        try {
            await setDoc(doc(db, "campus_plans", `${selectedCampusId}_${selectedYear}`), { campusId: selectedCampusId, year: selectedYear, plans: planData, updatedAt: serverTimestamp() });
            alert("保存しました。");
        } catch (e) { alert(e.message); } finally { setIsSavingPlan(false); }
    };

    const handleDateClick = (day) => {
        const mIdx = MONTHS_LIST.indexOf(selectedMonth);
        const { targetYear: ty, jsMonth: tm } = getWeeksStruct(selectedYear, mIdx);
        const ds = formatDateStr(new Date(ty, tm, day));
        setReportDate(ds);
        const existing = realDailyReports.find(r => r.campusId === selectedCampusId && r.date === ds);
        setDailyReportInput(existing ? { weather: existing.weather, touchTry: existing.touchTry, flyers: existing.flyers, trialLessons: existing.trialLessons } : { weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });
        setIsInputModalOpen(true);
    };

    const handleSaveDailyReport = async () => {
        setIsSavingReport(true);
        try {
            await setDoc(doc(db, "daily_reports", `${selectedCampusId}_${reportDate}`), { campusId: selectedCampusId, date: reportDate, ...dailyReportInput, updatedAt: serverTimestamp() });
            await fetchFromFirebaseAndCache();
            setIsInputModalOpen(false);
        } catch (e) { alert(e.message); } finally { setIsSavingReport(false); }
    };

    const handleMenuClick = (tab, cid = 'All') => { setActiveTab(tab); setSelectedCampusId(cid); };
    const toggleCampusMenu = (cid) => { setExpandedCampusId(expandedCampusId === cid ? null : cid); };
    const handleWeatherSelect = (w) => setDailyReportInput(prev => ({ ...prev, weather: w, ...(w === 'closed' ? { flyers:0, touchTry:0, trialLessons:0 } : {}) }));

    const renderCalendar = () => {
        const mIdx = MONTHS_LIST.indexOf(selectedMonth);
        const { targetYear, jsMonth, daysInMonth } = getWeeksStruct(selectedYear, mIdx);
        const firstDay = new Date(targetYear, jsMonth, 1).getDay();
        const weatherMap = { sunny: { i: Sun, c: 'text-orange-500' }, cloudy: { i: Cloud, c: 'text-gray-500' }, rainy: { i: CloudRain, c: 'text-blue-500' }, snowy: { i: Snowflake, c: 'text-cyan-500' }, closed: { i: Ban, c: 'text-rose-500' } };
        const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`b-${i}`} className="h-24 bg-slate-50 border border-slate-100"></div>);
        const days = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const ds = `${targetYear}-${('0'+(jsMonth+1)).slice(-2)}-${('0'+day).slice(-2)}`;
            const r = realDailyReports.find(x => x.campusId === selectedCampusId && x.date === ds);
            const isToday = ds === formatDateStr(new Date());
            const WInfo = r?.weather ? weatherMap[r.weather] : null;
            const WIcon = WInfo ? WInfo.i : null;
            return (
                <div key={day} onClick={() => handleDateClick(day)} className={`h-24 border p-1.5 cursor-pointer hover:bg-blue-50 transition-colors relative flex flex-col ${isToday ? 'bg-blue-50/50' : r?.weather === 'closed' ? 'bg-slate-100' : 'bg-white'}`}>
                    <div className="flex justify-between items-start mb-1"><span className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{day}</span>{WIcon && <WIcon className={`w-4 h-4 ${WInfo.c}`} />}</div>
                    {r && (
                        <div className="flex-1 flex flex-col justify-end gap-0.5 overflow-hidden">
                            {r.weather === 'closed' ? <div className="flex-1 flex items-center justify-center text-xs font-bold text-slate-400">休校</div> : (
                                <><div className="text-[10px] bg-slate-50 px-1 rounded flex justify-between"><span>門配</span><b className="text-slate-700">{r.flyers}</b></div>
                                <div className="text-[10px] bg-slate-50 px-1 rounded flex justify-between"><span>T&T</span><b className="text-slate-700">{r.touchTry}</b></div></>
                            )}
                        </div>
                    )}
                </div>
            );
        });
        return [...blanks, ...days];
    };

    if (isLoading && !rawDataMap) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            {/* サイドバー (オリジナルUI) */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 overflow-y-auto">
                <div className="p-6 border-b border-slate-800 flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-white" /></div>
                    <span className="text-lg font-bold">RobotSchoolDash</span>
                </div>
                <nav className="flex-1 py-4 px-3 space-y-1">
                    <button onClick={() => handleMenuClick('summary')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'summary' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <LayoutDashboard className="w-5 h-5" /><span className="font-medium">経営サマリー</span>
                    </button>
                    <button onClick={() => handleMenuClick('students')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'students' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Users className="w-5 h-5" /><span className="font-medium">生徒管理</span>
                    </button>
                    <button onClick={() => handleMenuClick('marketing')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'marketing' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Megaphone className="w-5 h-5" /><span className="font-medium">集客・販促</span>
                    </button>
                    <div className="pt-4 pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider flex justify-between cursor-pointer" onClick={() => setIsCampusMenuOpen(!isCampusMenuOpen)}>
                        <span>校舎管理</span><ChevronDown className={`w-4 h-4 transition-transform ${isCampusMenuOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {isCampusMenuOpen && campusList.map(c => (
                        <div key={c.id} className="ml-2">
                            <button onClick={() => toggleCampusMenu(c.id)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 ${expandedCampusId === c.id ? 'bg-slate-800 text-white' : ''}`}>
                                <div className="flex items-center"><Building className="w-4 h-4 mr-2" /><span className="text-sm">{c.name}</span></div>
                                <ChevronRight className={`w-3 h-3 transition-transform ${expandedCampusId === c.id ? 'rotate-90' : ''}`} />
                            </button>
                            {expandedCampusId === c.id && (
                                <div className="ml-4 pl-2 border-l border-slate-700 mt-1 space-y-1">
                                    <button onClick={() => handleMenuClick('campus_daily', c.id)} className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'campus_daily' && selectedCampusId === c.id ? 'text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>└ 日報入力</button>
                                    <button onClick={() => handleMenuClick('campus_yearly', c.id)} className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'campus_yearly' && selectedCampusId === c.id ? 'text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>└ 年間計画入力</button>
                                </div>
                            )}
                        </div>
                    ))}
                    <button onClick={() => handleMenuClick('settings')} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors mt-4 ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Settings className="w-5 h-5" /><span>設定</span>
                    </button>
                </nav>
                <div className="p-4 border-t border-slate-800 text-xs text-slate-400 flex justify-between">
                    <span>{lastUpdated?.toLocaleTimeString()} 更新</span>
                    <button onClick={fetchFromFirebaseAndCache}><RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} /></button>
                </div>
            </aside>

            {/* メイン (オリジナルUI) */}
            <main className="flex-1 flex flex-col overflow-hidden h-screen relative">
                <header className="bg-white border-b h-16 flex items-center justify-between px-6 sticky top-0 z-10 shrink-0">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{{summary:'経営サマリー', students:'生徒管理', marketing:'集客・販促', campus_daily:'日報入力', campus_yearly:'年間計画', settings:'設定'}[activeTab]}</h1>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center"><MapPin className="w-3 h-3 mr-1"/> {selectedCampusName}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-slate-100 border-none text-sm rounded-lg px-3 py-1">{YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}</select>
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            {['annual','monthly','weekly'].map(m => <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1 text-xs font-medium rounded-md ${viewMode === m ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>{{annual:'年度',monthly:'月度',weekly:'週次'}[m]}</button>)}
                        </div>
                        {viewMode !== 'annual' && <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-slate-100 border-none text-sm rounded-lg px-3 py-1">{MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}</select>}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {activeTab === 'summary' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <StatCard title="体験予約 (申込)" value={`${totals.trialApp}件`} subValue="システム自動集計" icon={Calendar} color="bg-blue-500" />
                                    <StatCard title="体験実施 (日報)" value={`${totals.trialExec}件`} subValue="日報正数" icon={Activity} color="bg-amber-500" details={[{label:'イベント(予約)', value:totals.eventApp}]} />
                                    <StatCard title="新規入会" value={`${totals.newEnrollments}名`} subValue="期間内累計" icon={Users} color="bg-emerald-500" />
                                    <StatCard title="在籍生徒数" value={`${currentTotalStudents}名`} subValue="現在" icon={School} color="bg-indigo-500" />
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border h-[450px]">
                                    <h3 className="text-lg font-bold mb-6">入会・体験推移チャート</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={displayData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" />
                                            <YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" />
                                            <Tooltip /><Legend />
                                            <Bar yAxisId="left" dataKey="trialApp" name="体験予約" fill="#3b82f6" radius={[4,4,0,0]} />
                                            <Bar yAxisId="left" dataKey="trialExec" name="体験実施(日報)" fill="#f59e0b" radius={[4,4,0,0]} />
                                            <Line yAxisId="right" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} dot={{r:4}} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {activeTab === 'students' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <StatCard title="入会+転入" value={`${totals.newEnrollments + totals.transferIns}名`} subValue="増加" icon={Users} color="bg-emerald-500" details={[{label:'入会', value:totals.newEnrollments}, {label:'復会', value:totals.returns}, {label:'転入', value:totals.transferIns}]} />
                                    <StatCard title="退会+卒業" value={`${totals.withdrawals + totals.graduates + totals.transfers}名`} subValue="減少" icon={Users} color="bg-rose-500" details={[{label:'退会', value:totals.withdrawals}, {label:'卒業', value:totals.graduates}, {label:'転校', value:totals.transfers}]} />
                                    <StatCard title="純増数" value={`${(totals.newEnrollments+totals.transferIns)-(totals.withdrawals+totals.graduates+totals.transfers)}名`} subValue="推移" icon={TrendingUp} color="bg-blue-500" />
                                    <StatCard title="累計在籍" value={`${currentTotalStudents}名`} subValue="現在" icon={School} color="bg-indigo-500" />
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border h-[400px]">
                                    <h3 className="text-lg font-bold mb-6">生徒数増減フロー</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={displayData} stackOffset="sign">
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><ReferenceLine y={0} stroke="#000" />
                                            <Bar dataKey="newEnrollments" name="入会" fill="#10b981" stackId="a" />
                                            <Bar dataKey="transferIns" name="転入" fill="#06b6d4" stackId="a" />
                                            <Bar dataKey="withdrawals_neg" name="退会" fill="#ef4444" stackId="a" />
                                            <Bar dataKey="recesses_neg" name="休会" fill="#f59e0b" stackId="a" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {activeTab === 'marketing' && (
                            <div className="bg-white p-6 rounded-xl shadow-sm border h-[500px] animate-in fade-in duration-500">
                                <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold">集客ファネル (実施数は日報値を正とする)</h3></div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={displayData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" /><Tooltip /><Legend />
                                        <Bar yAxisId="left" dataKey="flyers" name="門配" fill="#94a3b8" />
                                        <Line yAxisId="right" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} />
                                        <Bar yAxisId="left" dataKey="trialApp" name="体験会予約" stackId="app" fill="#3b82f6" />
                                        <Bar yAxisId="left" dataKey="trialExec" name="体験実施(日報)" stackId="exec" fill="#f97316" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {activeTab === 'campus_daily' && (
                            <div className="bg-white p-6 rounded-xl shadow-sm border animate-in fade-in duration-500">
                                <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold flex items-center"><Calendar className="w-5 h-5 mr-2 text-blue-600" />{selectedYear}年度 {selectedMonth} 日報カレンダー</h2></div>
                                <div className="grid grid-cols-7 gap-px bg-slate-200 border rounded-lg overflow-hidden">
                                    {['日','月','火','水','木','金','土'].map(d => <div key={d} className="p-2 text-center text-xs font-bold bg-slate-100 text-slate-600">{d}</div>)}
                                    {renderCalendar()}
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="bg-white p-8 rounded-xl shadow-sm border animate-in fade-in duration-500">
                                <h2 className="text-lg font-bold mb-6">校舎設定</h2>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                    <input type="text" placeholder="ID (toyota)" value={newCampusId} onChange={e => setNewCampusId(e.target.value)} className="border p-2 rounded-lg" />
                                    <input type="text" placeholder="校舎名 (豊田本店校)" value={newCampusName} onChange={e => setNewCampusName(e.target.value)} className="border p-2 rounded-lg" />
                                    <button onClick={handleAddCampus} className="bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">登録</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {campusList.map(c => (
                                        <div key={c.id} className="flex justify-between p-4 bg-slate-50 border rounded-lg">
                                            <div><div className="font-bold">{c.name}</div><div className="text-xs text-slate-400">ID: {c.id}</div></div>
                                            <button onClick={() => handleDeleteCampus(c.id, c.name)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Input Modal */}
                {isInputModalOpen && (
                    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between border-b pb-4 mb-6">
                                <h3 className="font-bold text-lg flex items-center"><PenTool className="w-5 h-5 mr-2 text-blue-600" />日報入力: {reportDate}</h3>
                                <button onClick={() => setIsInputModalOpen(false)}><X className="text-slate-400" /></button>
                            </div>
                            <div className="space-y-6">
                                <div className="grid grid-cols-5 gap-2">
                                    {[{id:'sunny',i:Sun},{id:'cloudy',i:Cloud},{id:'rainy',i:CloudRain},{id:'snowy',i:Snowflake},{id:'closed',i:Ban}].map(w => (
                                        <button key={w.id} onClick={() => handleWeatherSelect(w.id)} className={`p-2 border rounded-lg flex flex-col items-center ${dailyReportInput.weather === w.id ? 'bg-blue-50 border-blue-500' : 'hover:bg-slate-50'}`}><w.i className="w-6 h-6 mb-1 text-slate-500" /><span className="text-[10px]">{w.id}</span></button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500">門配 (枚)</label><input type="number" value={dailyReportInput.flyers} onChange={e=>setDailyReportInput({...dailyReportInput,flyers:Number(e.target.value)})} className="w-full border p-2 rounded-lg text-right" /></div>
                                    <div><label className="text-xs font-bold text-slate-500">T&T (件)</label><input type="number" value={dailyReportInput.touchTry} onChange={e=>setDailyReportInput({...dailyReportInput,touchTry:Number(e.target.value)})} className="w-full border p-2 rounded-lg text-right" /></div>
                                    <div className="col-span-2"><label className="text-xs font-bold text-slate-500">体験会実施数 (日報正数)</label><input type="number" value={dailyReportInput.trialLessons} onChange={e=>setDailyReportInput({...dailyReportInput,trialLessons:Number(e.target.value)})} className="w-full border p-2 rounded-lg text-right" /></div>
                                </div>
                                <button onClick={handleSaveDailyReport} disabled={isSavingReport} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 flex justify-center items-center">
                                    {isSavingReport ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}日報を保存
                                </button>
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
