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
    TRIAL_APPS: 'dash_trial_apps', // ★追加
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
        let isWeekEnd = false;
        if (dayOfWeek === 0) {
            if (day === 1) isWeekEnd = false;
            else isWeekEnd = true;
        }
        if (day === daysInMonth) isWeekEnd = true;

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
    const [realTrialApps, setRealTrialApps] = useState([]); // ★追加: 体験会申込データ

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
            const cachedEnroll = localStorage.getItem(CACHE_KEYS.ENROLLMENTS);
            const cachedStatus = localStorage.getItem(CACHE_KEYS.STATUS);
            const cachedTransfers = localStorage.getItem(CACHE_KEYS.TRANSFERS);
            const cachedReports = localStorage.getItem(CACHE_KEYS.DAILY_REPORTS);
            const cachedTrialApps = localStorage.getItem(CACHE_KEYS.TRIAL_APPS); // ★追加
            const cachedTime = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);

            if (cachedCampuses && cachedEnroll && cachedStatus && cachedTransfers) {
                setCampusList(JSON.parse(cachedCampuses));
                setRealEnrollments(JSON.parse(cachedEnroll));
                setRealStatusChanges(JSON.parse(cachedStatus));
                setRealTransfers(JSON.parse(cachedTransfers));
                if (cachedReports) setRealDailyReports(JSON.parse(cachedReports));
                if (cachedTrialApps) setRealTrialApps(JSON.parse(cachedTrialApps)); // ★追加
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
                getDocs(collection(db, "trial_applications")) // ★追加
            ]);

            const campuses = campusSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id, sheetName: doc.data().sheetName || doc.data().name || doc.id }));
            const enrollments = enrollSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const status = statusSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const transfers = transferSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const reports = reportSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const trialApps = trialSnap.docs.map(d => ({id:d.id, ...d.data()})); // ★追加
            const now = new Date();

            setCampusList(campuses);
            setRealEnrollments(enrollments);
            setRealStatusChanges(status);
            setRealTransfers(transfers);
            setRealDailyReports(reports);
            setRealTrialApps(trialApps); // ★追加
            setLastUpdated(now);
            setIsUsingCache(false);

            localStorage.setItem(CACHE_KEYS.CAMPUSES, JSON.stringify(campuses));
            localStorage.setItem(CACHE_KEYS.ENROLLMENTS, JSON.stringify(enrollments));
            localStorage.setItem(CACHE_KEYS.STATUS, JSON.stringify(status));
            localStorage.setItem(CACHE_KEYS.TRANSFERS, JSON.stringify(transfers));
            localStorage.setItem(CACHE_KEYS.DAILY_REPORTS, JSON.stringify(reports));
            localStorage.setItem(CACHE_KEYS.TRIAL_APPS, JSON.stringify(trialApps)); // ★追加
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

    // 集計ロジック実行
    useEffect(() => {
        const generateData = async () => {
            setIsLoading(true);
            await new Promise(resolve => setTimeout(resolve, 100));
            // ★引数に realTrialApps を追加
            const map = generateAllCampusesData(campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, selectedYear);
            setRawDataMap(map);
            setIsLoading(false);
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

    // ==========================================
    // ★ 集計ロジック (体験会データ対応)
    // ==========================================
    const generateAllCampusesData = (targetCampuses, realEnrollmentList, realStatusList, realTransferList, dailyReportsList, trialAppsList, targetYear) => {
        const dataMap = {};
        const sheetNameToIdMap = {};
        
        targetCampuses.forEach(c => {
            const key = c.sheetName || c.name;
            sheetNameToIdMap[key] = c.id;
            sheetNameToIdMap[normalizeString(key)] = c.id;
        });

        // マップ作成 (O(1)アクセス用)
        const reportMap = {};
        dailyReportsList.forEach(r => {
            if (r.campusId && r.date) reportMap[`${r.campusId}_${r.date}`] = r;
        });

        // ★ 体験会データを整形してマップ化 (キャンパスID別)
        const trialDataByCampus = {};
        trialAppsList.forEach(app => {
            const campusId = sheetNameToIdMap[app.campus] || sheetNameToIdMap[normalizeString(app.campus)];
            if (!campusId) return;
            if (!trialDataByCampus[campusId]) trialDataByCampus[campusId] = [];
            trialDataByCampus[campusId].push(app);
        });

        const countTotalBefore = (list, year, typeFilter = null) => {
            const counts = {};
            if (!list) return counts;
            list.forEach(item => {
                const dateObj = parseDate(item.date);
                if (!dateObj) return;
                if (getFiscalYear(dateObj) >= year) return;
                if (typeFilter && (!item.type || !item.type.includes(typeFilter))) return;
                const rawSheetName = item.campus;
                const campusId = sheetNameToIdMap[rawSheetName] || sheetNameToIdMap[normalizeString(rawSheetName)];
                if (!campusId) return;
                counts[campusId] = (counts[campusId] || 0) + 1;
            });
            return counts;
        };

        const countEvents = (list, typeFilter = null) => {
            const counts = {};
            if (!list) return counts;
            list.forEach(item => {
                const dateObj = parseDate(item.date);
                if (!dateObj) return;
                if (getFiscalYear(dateObj) !== targetYear) return;
                if (typeFilter && (!item.type || !item.type.includes(typeFilter))) return;
                const rawSheetName = item.campus;
                const campusId = sheetNameToIdMap[rawSheetName] || sheetNameToIdMap[normalizeString(rawSheetName)];
                if (!campusId) return;
                const monthIdx = (dateObj.getMonth() + 9) % 12;
                const day = dateObj.getDate();
                if (!counts[campusId]) counts[campusId] = {};
                if (!counts[campusId][monthIdx]) counts[campusId][monthIdx] = { total: 0, days: {} };
                counts[campusId][monthIdx].total++;
                if (!counts[campusId][monthIdx].days[day]) counts[campusId][monthIdx].days[day] = 0;
                counts[campusId][monthIdx].days[day]++;
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

        const hasRealData = realEnrollmentList.length > 0 || realStatusList.length > 0 || realTransferList.length > 0;

        targetCampuses.forEach(campusObj => {
            const campusId = campusObj.id;
            let currentStudents = 0;
            
            if (hasRealData) {
                const pEnroll = prevEnrollments[campusId] || 0;
                const pTransferIn = prevTransferIns[campusId] || 0;
                const pWithdraw = prevWithdrawals[campusId] || 0;
                const pTransfer = prevTransfers[campusId] || 0;
                const pGraduate = prevGraduates[campusId] || 0;
                currentStudents = (pEnroll + pTransferIn) - (pWithdraw + pTransfer + pGraduate);
            }

            // このキャンパスの体験会データ
            const myTrialApps = trialDataByCampus[campusId] || [];

            dataMap[campusId] = MONTHS_LIST.map((month, mIdx) => {
                const getCount = (countsObj) => (countsObj[campusId] && countsObj[campusId][mIdx]) ? countsObj[campusId][mIdx].total : 0;
                const getDays = (countsObj) => (countsObj[campusId] && countsObj[campusId][mIdx]) ? countsObj[campusId][mIdx].days : {};

                let val = { enroll: 0, withdraw: 0, recess: 0, return: 0, transfer: 0, graduate: 0, transferIn: 0 };

                if (hasRealData) {
                    val.enroll = getCount(enrollmentCounts);
                    val.transferIn = getCount(transferInCounts);
                    val.withdraw = getCount(withdrawalCounts);
                    val.recess = getCount(recessCounts);
                    val.return = getCount(returnCounts);
                    val.transfer = getCount(transferCounts);
                    val.graduate = getCount(graduateCounts);
                }

                const { weeks, daysInMonth, targetYear: tYear, jsMonth: tMonth } = getWeeksStruct(targetYear, mIdx);

                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const dayNum = dIdx + 1;
                    const getDayCount = (daysObj) => (daysObj[dayNum] || 0);
                    
                    const dateStr = `${tYear}-${('0'+(tMonth+1)).slice(-2)}-${('0'+dayNum).slice(-2)}`;
                    const report = reportMap[`${campusId}_${dateStr}`] || {};

                    // ★体験会・イベント集計 (日次)
                    let dTrialApp = 0, dEventApp = 0, dTrialExec = 0, dEventExec = 0;
                    myTrialApps.forEach(app => {
                        const isEvent = app.type && app.type.includes('イベント');
                        // 申込日基準
                        const appDate = parseDate(app.date);
                        if (appDate && formatDateStr(appDate) === dateStr) {
                            if (isEvent) dEventApp++; else dTrialApp++;
                        }
                        // 実施日基準
                        const execDate = parseDate(app.trialDate);
                        if (execDate && formatDateStr(execDate) === dateStr) {
                            if (isEvent) dEventExec++; else dTrialExec++;
                        }
                    });

                    const dEnroll = hasRealData ? getDayCount(getDayCount(getDays(enrollmentCounts))) : 0;
                    const dTransferIn = hasRealData ? getDayCount(getDays(transferInCounts)) : 0;
                    const dWithdraw = hasRealData ? getDayCount(getDays(withdrawalCounts)) : 0;
                    const dTransfer = hasRealData ? getDayCount(getDays(transferCounts)) : 0;
                    const dGraduate = hasRealData ? getDayCount(getDays(graduateCounts)) : 0;
                    
                    return {
                        name: `${dayNum}日`,
                        budgetRevenue: 0, actualRevenue: 0,
                        newEnrollments: dEnroll,
                        transferIns: dTransferIn,
                        withdrawals: dWithdraw,
                        recesses: hasRealData ? getDayCount(getDays(recessCounts)) : 0,
                        returns: hasRealData ? getDayCount(getDays(returnCounts)) : 0,
                        transfers: dTransfer,
                        graduates: dGraduate,
                        
                        flyers: report.flyers || 0,
                        touchAndTry: report.touchTry || 0,
                        // trialLessons: report.trialLessons || 0, // 日報の手入力値(使わない場合はコメントアウト)
                        
                        // ★自動集計された体験会データ
                        trialApp: dTrialApp,
                        eventApp: dEventApp,
                        trialExec: dTrialExec,
                        eventExec: dEventExec,

                        totalStudents: currentStudents, 
                        withdrawals_neg: -dWithdraw,
                        recesses_neg: hasRealData ? -getDayCount(getDays(recessCounts)) : 0,
                        transfers_neg: -dTransfer,
                        graduates_neg: -dGraduate
                    };
                });

                const weekly = weeks.map(week => {
                    let wVal = { 
                        enroll: 0, withdraw: 0, recess: 0, return: 0, transfer: 0, graduate: 0, transferIn: 0,
                        flyers: 0, touch: 0, trialApp: 0, eventApp: 0, trialExec: 0, eventExec: 0
                    };
                    
                    for (let i = week.startDay - 1; i < week.endDay; i++) {
                        if (daily[i]) {
                            wVal.enroll += daily[i].newEnrollments;
                            wVal.transferIn += daily[i].transferIns;
                            wVal.withdraw += daily[i].withdrawals;
                            wVal.recess += daily[i].recesses;
                            wVal.return += daily[i].returns;
                            wVal.transfer += daily[i].transfers;
                            wVal.graduate += daily[i].graduates;
                            
                            wVal.flyers += daily[i].flyers;
                            wVal.touch += daily[i].touchAndTry;
                            
                            wVal.trialApp += daily[i].trialApp;
                            wVal.eventApp += daily[i].eventApp;
                            wVal.trialExec += daily[i].trialExec;
                            wVal.eventExec += daily[i].eventExec;
                        }
                    }

                    return {
                        name: week.name,
                        budgetRevenue: 0, actualRevenue: 0,
                        newEnrollments: wVal.enroll,
                        transferIns: wVal.transferIn,
                        withdrawals: wVal.withdraw,
                        recesses: wVal.recess,
                        returns: wVal.return,
                        transfers: wVal.transfer,
                        graduates: wVal.graduate,
                        
                        flyers: wVal.flyers,
                        touchAndTry: wVal.touch,
                        
                        trialApp: wVal.trialApp,
                        eventApp: wVal.eventApp,
                        trialExec: wVal.trialExec,
                        eventExec: wVal.eventExec,

                        totalStudents: currentStudents,
                        withdrawals_neg: -wVal.withdraw,
                        recesses_neg: -wVal.recess,
                        transfers_neg: -wVal.transfer,
                        graduates_neg: -wVal.graduate
                    };
                });

                const netChange = (val.enroll + val.transferIn) - (val.withdraw + val.transfer + val.graduate);
                currentStudents += netChange;

                let mFlyers = 0, mTouch = 0, mTrialApp = 0, mEventApp = 0, mTrialExec = 0, mEventExec = 0;
                daily.forEach(d => {
                    mFlyers += d.flyers;
                    mTouch += d.touchAndTry;
                    mTrialApp += d.trialApp;
                    mEventApp += d.eventApp;
                    mTrialExec += d.trialExec;
                    mEventExec += d.eventExec;
                });

                return {
                    name: month,
                    budgetRevenue: 0, actualRevenue: 0,
                    newEnrollments: val.enroll,
                    transferIns: val.transferIn,
                    withdrawals: val.withdraw,
                    recesses: val.recess,
                    returns: val.return,
                    transfers: val.transfer,
                    graduates: val.graduate,
                    totalStudents: currentStudents,
                    
                    flyers: mFlyers,
                    touchAndTry: mTouch,
                    
                    trialApp: mTrialApp,
                    eventApp: mEventApp,
                    trialExec: mTrialExec,
                    eventExec: mEventExec,

                    enrollmentRate: "0.0",
                    withdrawals_neg: -val.withdraw,
                    recesses_neg: -val.recess,
                    transfers_neg: -val.transfer,
                    graduates_neg: -val.graduate,
                    daily, weekly
                };
            });
        });

        // 合計ロジック ('All')
        dataMap['All'] = MONTHS_LIST.map((month, idx) => {
            const { weeks, daysInMonth } = getWeeksStruct(targetYear, idx);

            const combined = {
                name: month,
                budgetRevenue: 0, actualRevenue: 0,
                newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0,
                totalStudents: 0, flyers: 0, touchAndTry: 0,
                trialApp: 0, eventApp: 0, trialExec: 0, eventExec: 0,
                withdrawals_neg: 0, recesses_neg: 0, transfers_neg: 0, graduates_neg: 0,
                
                daily: Array.from({ length: daysInMonth }, (_, i) => ({ 
                    name: `${i+1}日`, 
                    newEnrollments:0, transferIns:0, returns:0, withdrawals:0, recesses:0, transfers:0, graduates:0, 
                    flyers: 0, touchAndTry: 0, trialApp: 0, eventApp: 0, trialExec: 0, eventExec: 0,
                    withdrawals_neg: 0, recesses_neg: 0, transfers_neg: 0, graduates_neg: 0 
                })),
                
                weekly: weeks.map(w => ({
                    name: w.name,
                    newEnrollments:0, transferIns:0, returns:0, withdrawals:0, recesses:0, transfers:0, graduates:0, 
                    flyers: 0, touchAndTry: 0, trialApp: 0, eventApp: 0, trialExec: 0, eventExec: 0,
                    withdrawals_neg: 0, recesses_neg: 0, transfers_neg: 0, graduates_neg: 0 
                }))
            };

            targetCampuses.forEach(campusObj => {
                const d = dataMap[campusObj.id]?.[idx];
                if (d) {
                    Object.keys(combined).forEach(k => {
                        if (typeof combined[k] === 'number') combined[k] += d[k];
                    });
                    d.daily.forEach((day, i) => {
                        if (combined.daily[i]) {
                            Object.keys(day).forEach(k => {
                                if(typeof day[k] === 'number' && k!=='name') combined.daily[i][k] = (combined.daily[i][k]||0) + day[k];
                            });
                        }
                    });
                    d.weekly.forEach((wk, i) => {
                        if (combined.weekly[i]) {
                            Object.keys(wk).forEach(k => {
                                if(typeof wk[k] === 'number' && k!=='name') combined.weekly[i][k] = (combined.weekly[i][k]||0) + wk[k];
                            });
                        }
                    });
                }
            });
            return combined;
        });

        return dataMap;
    };

    const totals = useMemo(() => {
        if (!displayData || displayData.length === 0) return { newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0, flyers: 0, touchAndTry: 0, trialApp: 0, eventApp: 0, trialExec: 0, eventExec: 0 };
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

        }), { newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0, flyers: 0, touchAndTry: 0, trialApp: 0, eventApp: 0, trialExec: 0, eventExec: 0 });
    }, [displayData]);

    const currentTotalStudents = displayData.length > 0 ? (viewMode === 'annual' ? displayData[displayData.length-1].totalStudents : displayData[0].totalStudents) : 0;
    const viewModeLabel = { 'annual': '年度', 'monthly': `月度 (${selectedMonth})`, 'weekly': `週次 (${selectedMonth})` }[viewMode];

    const handleAddCampus = async () => {
        const id = newCampusId.trim();
        const name = newCampusName.trim();
        const sheetName = newCampusSheetName.trim() || name;
        if (!id || !name) return alert("校舎IDと校舎名は必須です。");
        if (campusList.some(c => c.id === id)) return alert("ID重複");
        if (isFirebaseInitialized && db) {
            try {
                await setDoc(doc(db, "campuses", id), { id, name, sheetName, createdAt: serverTimestamp() });
                await fetchFromFirebaseAndCache();
                setNewCampusId(""); setNewCampusName(""); setNewCampusSheetName("");
            } catch(e) { alert("登録エラー: " + e.message); }
        }
    };

    const handleDeleteCampus = async (targetId, targetName) => {
        if (!confirm(`${targetName} を削除しますか？`)) return;
        if (isFirebaseInitialized && db) {
            try {
                await deleteDoc(doc(db, "campuses", targetId));
                await fetchFromFirebaseAndCache();
                if (selectedCampusId === targetId) setSelectedCampusId('All');
            } catch(e) { alert("削除エラー: " + e.message); }
        }
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
        if (selectedCampusId === 'All') return;
        setIsSavingPlan(true);
        try {
            await setDoc(doc(db, "campus_plans", `${selectedCampusId}_${selectedYear}`), { campusId: selectedCampusId, year: selectedYear, plans: planData, updatedAt: serverTimestamp() });
            alert("保存しました。");
        } catch (e) { alert("保存失敗: " + e.message); } finally { setIsSavingPlan(false); }
    };

    const handleDateClick = (day) => {
        const monthIdx = MONTHS_LIST.indexOf(selectedMonth);
        let targetYear = selectedYear;
        let jsMonth = monthIdx + 3;
        if (jsMonth > 11) {
            jsMonth -= 12;
            targetYear += 1;
        }
        
        const clickedDate = new Date(targetYear, jsMonth, day);
        const dateStr = formatDateStr(clickedDate);
        setReportDate(dateStr);

        const existingReport = realDailyReports.find(r => r.campusId === selectedCampusId && r.date === dateStr);
        if (existingReport) {
            const isClosed = existingReport.weather === 'closed';
            setDailyReportInput({
                weather: existingReport.weather || 'sunny',
                touchTry: isClosed ? 0 : (existingReport.touchTry || 0),
                flyers: isClosed ? 0 : (existingReport.flyers || 0),
                trialLessons: isClosed ? 0 : (existingReport.trialLessons || 0)
            });
        } else {
            setDailyReportInput({ weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });
        }
        
        setIsInputModalOpen(true);
    };

    const handleSaveDailyReport = async () => {
        if (selectedCampusId === 'All') return;
        setIsSavingReport(true);
        try {
            await setDoc(doc(db, "daily_reports", `${selectedCampusId}_${reportDate}`), { 
                campusId: selectedCampusId, 
                date: reportDate, 
                ...dailyReportInput, 
                updatedAt: serverTimestamp() 
            });
            alert("日報を保存しました。");
            await fetchFromFirebaseAndCache();
            setIsInputModalOpen(false);
        } catch (e) { alert("保存失敗: " + e.message); } finally { setIsSavingReport(false); }
    };

    const handleMenuClick = (tab, campusId = 'All') => {
        setActiveTab(tab);
        setSelectedCampusId(campusId);
    };

    const toggleCampusMenu = (campusId) => {
        setExpandedCampusId(expandedCampusId === campusId ? null : campusId);
    };

    const handleWeatherSelect = (weatherId) => {
        if (weatherId === 'closed') {
            setDailyReportInput({ ...dailyReportInput, weather: weatherId, flyers: 0, touchTry: 0, trialLessons: 0 });
        } else {
            setDailyReportInput({ ...dailyReportInput, weather: weatherId });
        }
    };

    const renderCalendar = () => {
        const monthIdx = MONTHS_LIST.indexOf(selectedMonth);
        let targetYear = selectedYear;
        let jsMonth = monthIdx + 3;
        if (jsMonth > 11) {
            jsMonth -= 12;
            targetYear += 1;
        }

        const firstDay = new Date(targetYear, jsMonth, 1).getDay(); // 0:Sun
        const daysInMonth = new Date(targetYear, jsMonth + 1, 0).getDate();
        
        const weatherMap = {
            sunny: { i: Sun, c: 'text-orange-500' },
            cloudy: { i: Cloud, c: 'text-gray-500' },
            rainy: { i: CloudRain, c: 'text-blue-500' },
            snowy: { i: Snowflake, c: 'text-cyan-500' },
            closed: { i: Ban, c: 'text-rose-500' }
        };

        const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`blank-${i}`} className="h-24 bg-slate-50 border border-slate-100"></div>);
        
        const days = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${targetYear}-${('0'+(jsMonth+1)).slice(-2)}-${('0'+day).slice(-2)}`;
            const report = realDailyReports.find(r => r.campusId === selectedCampusId && r.date === dateStr);
            const isToday = dateStr === formatDateStr(new Date());
            const isClosed = report && report.weather === 'closed';
            
            const WeatherInfo = report && report.weather ? weatherMap[report.weather] : null;
            const WeatherIcon = WeatherInfo ? WeatherInfo.i : null;

            return (
                <div 
                    key={day} 
                    onClick={() => handleDateClick(day)}
                    className={`h-24 border border-slate-200 p-1.5 cursor-pointer hover:bg-blue-50 transition-colors relative flex flex-col ${isToday ? 'bg-blue-50/50' : isClosed ? 'bg-slate-100' : 'bg-white'}`}
                >
                    <div className="flex justify-between items-start mb-1">
                        <span className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
                            {day}
                        </span>
                        {WeatherIcon && <WeatherIcon className={`w-4 h-4 ${WeatherInfo.c}`} />}
                    </div>
                    
                    {isToday && <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded mb-1 w-fit">Today</span>}
                    
                    {report ? (
                        <div className="flex-1 flex flex-col justify-end gap-0.5 overflow-hidden">
                            {isClosed ? (
                                <div className="flex-1 flex items-center justify-center text-xs font-bold text-slate-400">休校</div>
                            ) : (
                                <>
                                    <div className="text-[10px] text-slate-500 bg-slate-50 px-1 rounded flex justify-between items-center"><span>門配</span><span className="font-bold text-slate-700">{report.flyers}</span></div>
                                    <div className="text-[10px] text-slate-500 bg-slate-50 px-1 rounded flex justify-between items-center"><span>T&T</span><span className="font-bold text-slate-700">{report.touchTry}</span></div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-300">
                            <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                        </div>
                    )}
                </div>
            );
        });

        return [...blanks, ...days];
    };

    if (isLoading && !rawDataMap) return (<div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500"><Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-600" /><p>Loading Dashboard...</p></div>);

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 overflow-y-auto">
                <div className="p-6 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-white" /></div>
                        <span className="text-lg font-bold tracking-tight">RobotSchool<span className="text-blue-400">Dash</span></span>
                    </div>
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
                    
                    <div className="pt-4 pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider flex justify-between cursor-pointer hover:text-slate-300" onClick={() => setIsCampusMenuOpen(!isCampusMenuOpen)}>
                        <span>校舎管理</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isCampusMenuOpen ? 'rotate-180' : ''}`} />
                    </div>
                    
                    {isCampusMenuOpen && (
                        <div className="space-y-1">
                            <button onClick={() => handleMenuClick('settings')} className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                                <Plus className="w-4 h-4" /><span className="text-sm">校舎追加</span>
                            </button>
                            
                            {campusList.map(campus => (
                                <div key={campus.id} className="ml-2">
                                    <button 
                                        onClick={() => toggleCampusMenu(campus.id)} 
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 ${expandedCampusId === campus.id ? 'text-white bg-slate-800' : ''}`}
                                    >
                                        <div className="flex items-center"><Building className="w-4 h-4 mr-2" /><span className="text-sm">{campus.name}</span></div>
                                        <ChevronRight className={`w-3 h-3 transition-transform ${expandedCampusId === campus.id ? 'rotate-90' : ''}`} />
                                    </button>
                                    
                                    {expandedCampusId === campus.id && (
                                        <div className="ml-4 pl-2 border-l border-slate-700 mt-1 space-y-1">
                                            <button 
                                                onClick={() => handleMenuClick('campus_daily', campus.id)} 
                                                className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'campus_daily' && selectedCampusId === campus.id ? 'text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                └ 日報入力
                                            </button>
                                            <button 
                                                onClick={() => handleMenuClick('campus_weekly', campus.id)} 
                                                className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'campus_weekly' && selectedCampusId === campus.id ? 'text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                └ 月度計画入力
                                            </button>
                                            <button 
                                                onClick={() => handleMenuClick('campus_yearly', campus.id)} 
                                                className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'campus_yearly' && selectedCampusId === campus.id ? 'text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                └ 年間計画入力
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-2 mt-auto">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center"><Database className={`w-3 h-3 mr-1 ${isFirebaseInitialized ? 'text-emerald-400' : 'text-slate-500'}`} />{isFirebaseInitialized ? (isUsingCache ? 'Local Cache' : 'Firebase') : 'Local Mode'}</div>
                    </div>
                    {lastUpdated && <div className="text-slate-500">更新: {lastUpdated.toLocaleTimeString()}</div>}
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden h-screen relative">
                {errorMsg && <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4 mb-0 flex justify-between items-center"><div className="flex"><AlertCircle className="h-5 w-5 text-red-500" /><div className="ml-3"><p className="text-sm text-red-700">{errorMsg}</p></div></div><button onClick={() => setErrorMsg(null)} className="text-red-500">×</button></div>}
                
                <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-10 shrink-0">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">
                            {{summary:'経営サマリー', students:'生徒数・入退会管理', marketing:'集客活動・販促管理', campus_daily:'日報入力 (カレンダー)', campus_weekly:'月度計画入力 (週次)', campus_yearly:'年間計画入力 (月度)', settings:'校舎設定・追加'}[activeTab]}
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center">
                            {selectedCampusId !== 'All' ? <><Building className="w-3 h-3 mr-1"/> {selectedCampusName}</> : '全校舎合計'}
                        </p>
                    </div>
                    <div className="flex items-center space-x-3">
                        {activeTab !== 'settings' && activeTab !== 'campus_weekly' && (
                            <>
                                <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1 border border-slate-200">
                                    <span className="text-xs text-slate-500 mr-2 font-bold">年度</span>
                                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1">{YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}</select>
                                </div>
                                {activeTab !== 'campus_yearly' && (
                                    <>
                                        {activeTab !== 'campus_daily' && (
                                            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                                {[{k:'annual',l:'年度'},{k:'monthly',l:'月度'},{k:'weekly',l:'週次'}].map(m=><button key={m.k} onClick={()=>setViewMode(m.k)} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode===m.k?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{m.l}</button>)}
                                            </div>
                                        )}
                                        {(viewMode !== 'annual' || activeTab === 'campus_daily') && (
                                            <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1 border border-slate-200">
                                                <Calendar className="w-3 h-3 text-slate-500 mr-2" />
                                                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1 pr-1">{MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}</select>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1 border border-slate-200">
                            <MapPin className="w-3 h-3 text-slate-500 mr-2" />
                            <select value={selectedCampusId} onChange={(e) => setSelectedCampusId(e.target.value)} className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1"><option value="All">全校舎 (合計)</option><option disabled>──────────</option>{campusList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        </div>
                        <button onClick={fetchFromFirebaseAndCache} className={`p-2 rounded-lg border border-slate-200 transition-all ${isSyncing ? 'bg-blue-50 text-blue-600' : 'bg-white hover:bg-slate-50 text-slate-600'}`} title="データを最新の状態に更新"><RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /></button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-7xl mx-auto space-y-6">
                        
                        {/* Daily Report Input (Calendar View) */}
                        {activeTab === 'campus_daily' && (
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
                                <div className="mb-4 flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-slate-800 flex items-center">
                                        <Calendar className="w-5 h-5 mr-2 text-blue-600" />
                                        {selectedYear}年度 {selectedMonth} 日報カレンダー
                                    </h2>
                                    <div className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">日付をクリックして入力・編集</div>
                                </div>
                                <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                                    {['日','月','火','水','木','金','土'].map((d,i) => (
                                        <div key={d} className={`p-2 text-center text-xs font-bold ${i===0?'text-red-500':i===6?'text-blue-500':'text-slate-600'} bg-slate-100`}>{d}</div>
                                    ))}
                                    {renderCalendar()}
                                </div>
                            </div>
                        )}

                        {/* Yearly Plan Input */}
                        {activeTab === 'campus_yearly' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-lg font-bold text-slate-800 flex items-center"><FileText className="w-5 h-5 mr-2 text-blue-600" />年間計画入力 ({selectedCampusName} / {selectedYear}年度)</h2>
                                        <button onClick={savePlanData} disabled={isSavingPlan} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center shadow-sm disabled:opacity-50"><Save className="w-4 h-4 mr-2" />{isSavingPlan ? '保存中...' : '計画を保存'}</button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left border-collapse">
                                            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200"><tr><th className="px-4 py-3 w-20">月度</th><th className="px-4 py-3 w-32">目標入会数</th><th className="px-4 py-3 w-32">体験会実施</th><th className="px-4 py-3 w-32">タッチ&トライ</th><th className="px-4 py-3 w-32">門配数</th><th className="px-4 py-3 w-24">入会率(%)</th></tr></thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {MONTHS_LIST.map((month) => (
                                                    <tr key={month} className="hover:bg-slate-50">
                                                        <td className="px-4 py-3 font-bold text-slate-700 bg-slate-50/50">{month}</td>
                                                        {['enrollments', 'trials', 'touchTry', 'flyers'].map(field => (
                                                            <td key={field} className="px-4 py-2"><input type="number" min="0" value={planData[month]?.[field] || 0} onChange={(e) => handlePlanChange(month, field, e.target.value)} className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right" /></td>
                                                        ))}
                                                        <td className="px-4 py-3 text-right font-medium text-slate-600">{planData[month]?.rate}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Monthly Plan Input (Placeholder) */}
                        {activeTab === 'campus_weekly' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-100 text-center">
                                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Calendar className="w-8 h-8 text-blue-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-2">月度計画（週次）入力</h3>
                                    <p className="text-slate-500 max-w-md mx-auto">
                                        この機能は現在準備中です。将来的に、月ごとの目標を週単位にブレイクダウンして管理できるようになります。
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Settings */}
                        {activeTab === 'settings' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
                                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center"><School className="w-5 h-5 mr-2 text-blue-600" />校舎マスター管理</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8 items-end">
                                        <div className="md:col-span-1"><label className="block text-sm font-medium text-slate-700 mb-2">校舎ID <span className="text-xs text-red-500">*英数</span></label><input type="text" value={newCampusId} onChange={(e) => setNewCampusId(e.target.value)} placeholder="例: shibuya" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                        <div className="md:col-span-1"><label className="block text-sm font-medium text-slate-700 mb-2">校舎名</label><input type="text" value={newCampusName} onChange={(e) => setNewCampusName(e.target.value)} placeholder="例: 渋谷校" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                        <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">連携名 (スプレッドシート)</label><input type="text" value={newCampusSheetName} onChange={(e) => setNewCampusSheetName(e.target.value)} placeholder="例: 渋谷校" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                        <div className="md:col-span-1"><button onClick={handleAddCampus} disabled={!newCampusId || !newCampusName} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center disabled:opacity-50"><Plus className="w-4 h-4 mr-2" />登録</button></div>
                                    </div>
                                    <div className="border-t border-slate-100 pt-6">
                                        <h3 className="text-sm font-bold text-slate-500 mb-4 uppercase tracking-wider">登録済み校舎一覧 ({campusList.length}校)</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{campusList.map(c => (<div key={c.id} className="flex justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"><div><div className="font-medium text-slate-700">{c.name}</div><div className="text-xs text-slate-400">ID: {c.id} | 連携: {c.sheetName}</div></div><button onClick={() => handleDeleteCampus(c.id, c.name)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div>))}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Summary */}
                        {activeTab === 'summary' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <StatCard title="売上実績" value={formatYen(totals.actualRevenue || 0)} subValue="選択期間" trend={0} icon={DollarSign} color="bg-blue-500" />
                                    <StatCard title="生徒数" value={`${currentTotalStudents}名`} subValue="在籍生徒数" trend={0} icon={Users} color="bg-indigo-500" />
                                    <StatCard title="体験会" value={`${totals.trialLessons || 0}回`} subValue="実施回数" trend={0} icon={Calendar} color="bg-amber-500" />
                                    <StatCard title="入会数" value={`${totals.newEnrollments}名`} subValue="新規獲得" trend={0} icon={Activity} color="bg-emerald-500" />
                                </div>
                            </div>
                        )}

                        {/* Students */}
                        {activeTab === 'students' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <StatCard title="期間内 増加数" value={`${totals.newEnrollments + totals.transferIns}名`} subValue="入会+転入" trend={0} icon={Users} color="bg-emerald-500" details={[{label:'入会', value:totals.newEnrollments}, {label:'復会(内数)', value:totals.returns}, {label:'転入', value:totals.transferIns}]} />
                                    <StatCard title="期間内 減少数" value={`${totals.withdrawals + totals.graduates + totals.transfers}名`} subValue="退会+卒業+転校" trend={0} icon={Users} color="bg-rose-500" details={[{label:'退会', value:totals.withdrawals}, {label:'卒業', value:totals.graduates}, {label:'転校', value:totals.transfers}, {label:'休会(内数)', value:totals.recesses}]} />
                                    <StatCard title="期間内 純増数" value={`${(totals.newEnrollments+totals.transferIns)-(totals.withdrawals+totals.graduates+totals.transfers)}名`} subValue="純増減" trend={0} icon={TrendingUp} color="bg-blue-500" />
                                    <StatCard title="在籍生徒数" value={`${currentTotalStudents}名`} subValue="累計生徒在籍数" trend={0} icon={School} color="bg-indigo-500" />
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[400px]">
                                    <h3 className="text-lg font-bold text-slate-800 mb-6">生徒数増減フロー</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={displayData} stackOffset="sign">
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" />
                                            <YAxis padding={{ top: 20, bottom: 20 }} domain={['auto', 'auto']} />
                                            <Tooltip />
                                            <Legend />
                                            <ReferenceLine y={0} stroke="#000" />
                                            <Bar dataKey="newEnrollments" name="入会" fill="#10b981" stackId="stack" />
                                            <Bar dataKey="returns" name="復会" fill="#34d399" stackId="stack" />
                                            <Bar dataKey="transferIns" name="転入" fill="#06b6d4" stackId="stack" />
                                            <Bar dataKey="withdrawals_neg" name="退会" fill="#ef4444" stackId="stack" />
                                            <Bar dataKey="recesses_neg" name="休会" fill="#f59e0b" stackId="stack" />
                                            <Bar dataKey="transfers_neg" name="転校" fill="#f97316" stackId="stack" />
                                            <Bar dataKey="graduates_neg" name="卒業" fill="#a855f7" stackId="stack" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                    <div className="p-6 border-b border-slate-100"><h3 className="text-lg font-bold text-slate-800">生徒数推移詳細</h3></div>
                                    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200"><tr><th className="px-4 py-3">期間</th><th className="px-4 py-3 text-emerald-600">入会</th><th className="px-4 py-3 text-emerald-600">復会</th><th className="px-4 py-3 text-cyan-600">転入</th><th className="px-4 py-3 text-rose-600">退会</th><th className="px-4 py-3 text-amber-600">休会</th><th className="px-4 py-3 text-orange-600">転校</th><th className="px-4 py-3 text-purple-600">卒業</th><th className="px-4 py-3 font-bold border-l border-slate-100">在籍生徒数</th></tr></thead><tbody className="divide-y divide-slate-100">{displayData.map((row, i) => (<tr key={i} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{row.name}</td><td className="px-4 py-3">{row.newEnrollments}</td><td className="px-4 py-3">{row.returns}</td><td className="px-4 py-3">{row.transferIns}</td><td className="px-4 py-3">{row.withdrawals}</td><td className="px-4 py-3">{row.recesses}</td><td className="px-4 py-3">{row.transfers}</td><td className="px-4 py-3">{row.graduates}</td><td className="px-4 py-3 font-bold border-l border-slate-100">{row.totalStudents}</td></tr>))}</tbody></table></div>
                                </div>
                            </div>
                        )}

                        {/* Marketing */}
                        {activeTab === 'marketing' && (
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[500px] animate-in fade-in duration-500">
                                <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-slate-800">集客ファネル</h3><span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{selectedCampusName} / {viewModeLabel}</span></div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={displayData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis yAxisId="left" orientation="left" />
                                        <YAxis yAxisId="right" orientation="right" />
                                        <Tooltip />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="flyers" name="門配" fill="#94a3b8" />
                                        <Line yAxisId="right" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} />
                                        <Bar yAxisId="left" dataKey="trialApp" name="体験会申込" stackId="application" fill="#3b82f6" />
                                        <Bar yAxisId="left" dataKey="eventApp" name="イベント申込" stackId="application" fill="#93c5fd" />
                                        <Bar yAxisId="left" dataKey="trialExec" name="体験会実施" stackId="execution" fill="#f97316" />
                                        <Bar yAxisId="left" dataKey="eventExec" name="イベント実施" stackId="execution" fill="#fdba74" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>

                {/* Input Modal */}
                {isInputModalOpen && (
                    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center p-4 border-b border-slate-100">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                    <PenTool className="w-5 h-5 mr-2 text-blue-600" />
                                    日報入力 <span className="ml-2 text-sm font-normal text-slate-500">{reportDate}</span>
                                </h3>
                                <button onClick={() => setIsInputModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
                            </div>
                            <div className="p-6 space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">本日の天気</label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {[{id:'sunny',l:'晴',i:Sun,c:'text-orange-500'},{id:'cloudy',l:'曇',i:Cloud,c:'text-gray-500'},{id:'rainy',l:'雨',i:CloudRain,c:'text-blue-500'},{id:'snowy',l:'雪',i:Snowflake,c:'text-cyan-500'},{id:'closed',l:'休校',i:Ban,c:'text-rose-500'}].map(w=> (
                                            <button key={w.id} onClick={()=>handleWeatherSelect(w.id)} className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${dailyReportInput.weather===w.id?'bg-blue-50 border-blue-500 ring-1 ring-blue-500':'border-slate-200 hover:bg-slate-50'}`}>
                                                <w.i className={`mb-1 w-5 h-5 ${w.c}`} />
                                                <span className="text-xs font-bold">{w.l}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">門配 (枚)</label><input type="number" min="0" disabled={dailyReportInput.weather==='closed'} className="border rounded-lg w-full p-2 text-right font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400" value={dailyReportInput.flyers} onChange={e=>setDailyReportInput({...dailyReportInput,flyers:Number(e.target.value)})}/></div>
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">T&T (件)</label><input type="number" min="0" disabled={dailyReportInput.weather==='closed'} className="border rounded-lg w-full p-2 text-right font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400" value={dailyReportInput.touchTry} onChange={e=>setDailyReportInput({...dailyReportInput,touchTry:Number(e.target.value)})}/></div>
                                    <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">体験会実施 (回)</label><input type="number" min="0" disabled={dailyReportInput.weather==='closed'} className="border rounded-lg w-full p-2 text-right font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400" value={dailyReportInput.trialLessons} onChange={e=>setDailyReportInput({...dailyReportInput,trialLessons:Number(e.target.value)})}/></div>
                                </div>
                                <button onClick={handleSaveDailyReport} disabled={isSavingReport} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold shadow hover:bg-blue-700 transition-all flex items-center justify-center disabled:opacity-50">
                                    {isSavingReport ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>} 日報を保存
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
