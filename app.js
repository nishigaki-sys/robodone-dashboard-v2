import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, AlertCircle, MapPin, Settings, Plus, Trash2, School, Database, Wifi, FileText, Save, RefreshCw } from "lucide-react";
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

// ★ 新規: 指定された年・月の週構成（期間・ラベル）を生成する関数
const getWeeksStruct = (fiscalYear, monthIndex) => {
    // monthIndex: 0(4月) ～ 11(3月)
    let targetYear = fiscalYear;
    let jsMonth = monthIndex + 3; // 4月=3
    if (jsMonth > 11) {
        jsMonth -= 12;
        targetYear += 1;
    }
    
    const daysInMonth = new Date(targetYear, jsMonth + 1, 0).getDate();
    const weeks = [];
    let startDay = 1;

    // 1日から月末までループして区切りを見つける
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(targetYear, jsMonth, day);
        const dayOfWeek = dateObj.getDay(); // 0:Sun, 1:Mon...
        
        let isWeekEnd = false;
        // 基本は日曜日(0)で区切る
        // 例外: 月初(1日)が日曜の場合は、その週には含めず翌週の日曜まで引っ張る(8日間)
        if (dayOfWeek === 0) {
            if (day === 1) isWeekEnd = false;
            else isWeekEnd = true;
        }
        // 月末は強制区切り
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
    const [viewMode, setViewMode] = useState('monthly');
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [selectedYear, setSelectedYear] = useState(currentFiscalYear);

    const [campusList, setCampusList] = useState(DEFAULT_CAMPUS_LIST);
    const [newCampusName, setNewCampusName] = useState("");
    const [newCampusId, setNewCampusId] = useState("");
    const [newCampusSheetName, setNewCampusSheetName] = useState("");
    
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isUsingCache, setIsUsingCache] = useState(false);

    const [planData, setPlanData] = useState(createInitialPlanData());
    const [isSavingPlan, setIsSavingPlan] = useState(false);

    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);

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
            const cachedTime = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);

            if (cachedCampuses && cachedEnroll && cachedStatus && cachedTransfers) {
                setCampusList(JSON.parse(cachedCampuses));
                setRealEnrollments(JSON.parse(cachedEnroll));
                setRealStatusChanges(JSON.parse(cachedStatus));
                setRealTransfers(JSON.parse(cachedTransfers));
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
            const [campusSnap, enrollSnap, statusSnap, transferSnap] = await Promise.all([
                getDocs(query(collection(db, "campuses"), orderBy("createdAt"))),
                getDocs(collection(db, "enrollments")),
                getDocs(collection(db, "status_changes")),
                getDocs(collection(db, "transfers"))
            ]);

            const campuses = campusSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id, sheetName: doc.data().sheetName || doc.data().name || doc.id }));
            const enrollments = enrollSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const status = statusSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const transfers = transferSnap.docs.map(d => ({id:d.id, ...d.data()}));
            const now = new Date();

            setCampusList(campuses);
            setRealEnrollments(enrollments);
            setRealStatusChanges(status);
            setRealTransfers(transfers);
            setLastUpdated(now);
            setIsUsingCache(false);

            localStorage.setItem(CACHE_KEYS.CAMPUSES, JSON.stringify(campuses));
            localStorage.setItem(CACHE_KEYS.ENROLLMENTS, JSON.stringify(enrollments));
            localStorage.setItem(CACHE_KEYS.STATUS, JSON.stringify(status));
            localStorage.setItem(CACHE_KEYS.TRANSFERS, JSON.stringify(transfers));
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

    useEffect(() => {
        const generateData = async () => {
            setIsLoading(true);
            await new Promise(resolve => setTimeout(resolve, 100));
            const map = generateAllCampusesData(campusList, realEnrollments, realStatusChanges, realTransfers, selectedYear);
            setRawDataMap(map);
            setIsLoading(false);
        };
        generateData();
    }, [campusList, realEnrollments, realStatusChanges, realTransfers, selectedYear]);

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
    // ★ 集計ロジック
    // ==========================================
    const generateAllCampusesData = (targetCampuses, realEnrollmentList, realStatusList, realTransferList, targetYear) => {
        const dataMap = {};
        const sheetNameToIdMap = {};
        
        targetCampuses.forEach(c => {
            const key = c.sheetName || c.name;
            sheetNameToIdMap[key] = c.id;
            sheetNameToIdMap[normalizeString(key)] = c.id;
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

                // ★ 週構造と日数の取得
                const { weeks, daysInMonth } = getWeeksStruct(targetYear, mIdx);

                // --- 日次データ生成 ---
                const daily = Array.from({ length: daysInMonth }, (_, dIdx) => {
                    const dayNum = dIdx + 1;
                    const getDayCount = (daysObj) => (daysObj[dayNum] || 0);
                    
                    const dEnroll = hasRealData ? getDayCount(getDays(enrollmentCounts)) : 0;
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
                        flyers: 0,
                        totalStudents: currentStudents, 
                        withdrawals_neg: -dWithdraw,
                        recesses_neg: hasRealData ? -getDayCount(getDays(recessCounts)) : 0,
                        transfers_neg: -dTransfer,
                        graduates_neg: -dGraduate
                    };
                });

                // --- 週次データ生成 (定義された週期間に基づいて集計) ---
                const weekly = weeks.map(week => {
                    let wVal = { enroll: 0, withdraw: 0, recess: 0, return: 0, transfer: 0, graduate: 0, transferIn: 0 };
                    
                    // week.startDay から week.endDay までの日次データを合計
                    for (let i = week.startDay - 1; i < week.endDay; i++) {
                        if (daily[i]) {
                            wVal.enroll += daily[i].newEnrollments;
                            wVal.transferIn += daily[i].transferIns;
                            wVal.withdraw += daily[i].withdrawals;
                            wVal.recess += daily[i].recesses;
                            wVal.return += daily[i].returns;
                            wVal.transfer += daily[i].transfers;
                            wVal.graduate += daily[i].graduates;
                        }
                    }

                    return {
                        name: week.name, // "第1週 (1日～7日)"
                        budgetRevenue: 0, actualRevenue: 0,
                        newEnrollments: wVal.enroll,
                        transferIns: wVal.transferIn,
                        withdrawals: wVal.withdraw,
                        recesses: wVal.recess,
                        returns: wVal.return,
                        transfers: wVal.transfer,
                        graduates: wVal.graduate,
                        flyers: 0,
                        totalStudents: currentStudents,
                        withdrawals_neg: -wVal.withdraw,
                        recesses_neg: -wVal.recess,
                        transfers_neg: -wVal.transfer,
                        graduates_neg: -wVal.graduate
                    };
                });

                const netChange = (val.enroll + val.transferIn) - (val.withdraw + val.transfer + val.graduate);
                currentStudents += netChange;

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
                    flyers: 0,
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
            // 月ごとの週構造を取得
            const { weeks, daysInMonth } = getWeeksStruct(targetYear, idx);

            const combined = {
                name: month,
                budgetRevenue: 0, actualRevenue: 0,
                newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0,
                totalStudents: 0, flyers: 0,
                withdrawals_neg: 0, recesses_neg: 0, transfers_neg: 0, graduates_neg: 0,
                
                daily: Array.from({ length: daysInMonth }, (_, i) => ({ 
                    name: `${i+1}日`, 
                    newEnrollments:0, transferIns:0, returns:0, withdrawals:0, recesses:0, transfers:0, graduates:0, 
                    withdrawals_neg: 0, recesses_neg: 0, transfers_neg: 0, graduates_neg: 0 
                })),
                
                weekly: weeks.map(w => ({
                    name: w.name,
                    newEnrollments:0, transferIns:0, returns:0, withdrawals:0, recesses:0, transfers:0, graduates:0, 
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
        if (!displayData || displayData.length === 0) return { newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0 };
        return displayData.reduce((acc, curr) => ({
            newEnrollments: acc.newEnrollments + (curr.newEnrollments || 0),
            transferIns: acc.transferIns + (curr.transferIns || 0),
            withdrawals: acc.withdrawals + (curr.withdrawals || 0),
            recesses: acc.recesses + (curr.recesses || 0),
            returns: acc.returns + (curr.returns || 0),
            transfers: acc.transfers + (curr.transfers || 0),
            graduates: acc.graduates + (curr.graduates || 0),
        }), { newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0 });
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

    if (isLoading && !rawDataMap) return (<div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500"><Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-600" /><p>Loading Dashboard...</p></div>);

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col">
                <div className="p-6 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center"><TrendingUp className="w-5 h-5 text-white" /></div>
                        <span className="text-lg font-bold tracking-tight">RobotSchool<span className="text-blue-400">Dash</span></span>
                    </div>
                </div>
                <nav className="flex-1 py-6 px-3 space-y-1">
                    {[
                        {id: 'summary', icon: LayoutDashboard, label: '経営サマリー'},
                        {id: 'students', icon: Users, label: '生徒管理'},
                        {id: 'marketing', icon: Megaphone, label: '集客・販促'},
                        {id: 'planning', icon: FileText, label: '計画管理'},
                        {id: 'settings', icon: Settings, label: '校舎設定'}
                    ].map(m => (
                        <button key={m.id} onClick={() => setActiveTab(m.id)} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === m.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                            <m.icon className="w-5 h-5" /><span className="font-medium">{m.label}</span>
                        </button>
                    ))}
                </nav>
                <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center"><Database className={`w-3 h-3 mr-1 ${isFirebaseInitialized ? 'text-emerald-400' : 'text-slate-500'}`} />{isFirebaseInitialized ? (isUsingCache ? 'Local Cache' : 'Firebase') : 'Local Mode'}</div>
                    </div>
                    {lastUpdated && <div className="text-slate-500">更新: {lastUpdated.toLocaleTimeString()}</div>}
                    <div className="flex items-center"><MapPin className="w-3 h-3 mr-1" />{selectedCampusName}</div>
                    <div className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{selectedYear}年度</div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden h-screen">
                {errorMsg && <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4 mb-0 flex justify-between items-center"><div className="flex"><AlertCircle className="h-5 w-5 text-red-500" /><div className="ml-3"><p className="text-sm text-red-700">{errorMsg}</p></div></div><button onClick={() => setErrorMsg(null)} className="text-red-500">×</button></div>}
                
                <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-10 shrink-0">
                    <h1 className="text-xl font-bold text-slate-800">
                        {{summary:'経営サマリー', students:'生徒数・入退会管理', marketing:'集客活動・販促管理', planning:'年間計画・予算管理', settings:'校舎設定・管理'}[activeTab]}
                    </h1>
                    <div className="flex items-center space-x-3">
                        {activeTab !== 'settings' && (
                            <>
                                <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1 border border-slate-200">
                                    <span className="text-xs text-slate-500 mr-2 font-bold">年度</span>
                                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1">{YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}</select>
                                </div>
                                {activeTab !== 'planning' && (
                                    <>
                                        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                            {[{k:'annual',l:'年度'},{k:'monthly',l:'月度'},{k:'weekly',l:'週次'}].map(m=><button key={m.k} onClick={()=>setViewMode(m.k)} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode===m.k?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{m.l}</button>)}
                                        </div>
                                        {viewMode !== 'annual' && (
                                            <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1 border border-slate-200">
                                                <Calendar className="w-3 h-3 text-slate-500 mr-2" />
                                                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1 pr-1">{MONTHS_LIST.map(m => <option key={m} value={m}>{m}</option>)}</select>
                                            </div>
                                        )}
                                    </>
                                )}
                                <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1 border border-slate-200">
                                    <MapPin className="w-3 h-3 text-slate-500 mr-2" />
                                    <select value={selectedCampusId} onChange={(e) => setSelectedCampusId(e.target.value)} className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer py-1"><option value="All">全校舎 (合計)</option><option disabled>──────────</option>{campusList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                                </div>
                                <button onClick={fetchFromFirebaseAndCache} disabled={isSyncing} className={`p-2 rounded-lg border border-slate-200 transition-all ${isSyncing ? 'bg-blue-50 text-blue-600' : 'bg-white hover:bg-slate-50 text-slate-600'}`} title="データを最新の状態に更新"><RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /></button>
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {activeTab === 'planning' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-lg font-bold text-slate-800 flex items-center"><FileText className="w-5 h-5 mr-2 text-blue-600" />年間計画入力 ({selectedCampusName} / {selectedYear}年度)</h2>
                                        {selectedCampusId !== 'All' && <button onClick={savePlanData} disabled={isSavingPlan} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center shadow-sm disabled:opacity-50"><Save className="w-4 h-4 mr-2" />{isSavingPlan ? '保存中...' : '計画を保存'}</button>}
                                    </div>
                                    {selectedCampusId === 'All' ? (
                                        <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg"><AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-400" /><p>全校舎の合計画面では計画入力はできません。</p></div>
                                    ) : (
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
                                    )}
                                </div>
                            </div>
                        )}

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
                                        <Bar yAxisId="left" dataKey="flyers" name="チラシ配布" fill="#94a3b8" />
                                        <Line yAxisId="right" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
const root = createRoot(document.getElementById('root'));
root.render(<RobotSchoolDashboard />);
