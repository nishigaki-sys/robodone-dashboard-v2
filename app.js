import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, MapPin, Plus, Trash2, School, Database, Save, Sun, Cloud, CloudRain, Snowflake, ChevronLeft, Building2 } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";

// ==========================================
// ★ Firebase設定
// ==========================================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCsgMN0SWCC1SvCDIakYBejTWlxwBmiwJk", // ※本番公開時は注意
    authDomain: "robodone-dashboard.firebaseapp.com",
    projectId: "robodone-dashboard",
    storageBucket: "robodone-dashboard.firebasestorage.app",
    messagingSenderId: "457095919160",
    appId: "1:457095919160:web:1716af87290b63733598cd"
};

const MONTHS_LIST = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月'];
const YEARS_LIST = [2022, 2023, 2024, 2025, 2026];

// Firebase初期化
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
// ヘルパー関数群
// ==========================================
const normalizeString = (str) => {
    if (!str) return "";
    return str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
};

const getFiscalYear = (dateObj) => {
    if (isNaN(dateObj.getTime())) return -1;
    const jstDate = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
    const month = jstDate.getUTCMonth();
    const year = jstDate.getUTCFullYear();
    return month < 3 ? year - 1 : year;
};

const getFiscalMonthIndexJST = (dateObj) => {
    if (isNaN(dateObj.getTime())) return -1;
    const jstDate = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
    const month = jstDate.getUTCMonth();
    return (month + 9) % 12;
};

const getDayJST = (dateObj) => {
    if (isNaN(dateObj.getTime())) return -1;
    const jstDate = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
    return jstDate.getUTCDate();
};

const formatYen = (val) => `¥${val.toLocaleString()}`;
const formatDate = (date) => {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
};
const createInitialPlanData = () => MONTHS_LIST.reduce((acc, m) => ({ ...acc, [m]: { enrollments: 0, trials: 0, touchTry: 0, flyers: 0, rate: 0 } }), {});

// ==========================================
// コンポーネント
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

function RobotSchoolDashboard() {
    const today = new Date();
    const currentFiscalYear = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    const currentMonthStr = `${today.getMonth() + 1}月`;

    const [activeTab, setActiveTab] = useState('summary');
    const [manageSubTab, setManageSubTab] = useState('plan');
    const [selectedCampusId, setSelectedCampusId] = useState('All');
    const [viewMode, setViewMode] = useState('monthly');
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [selectedYear, setSelectedYear] = useState(currentFiscalYear);

    // データ状態
    const [campusList, setCampusList] = useState([]);
    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);
    const [realDailyReports, setRealDailyReports] = useState([]);
    const [planData, setPlanData] = useState(createInitialPlanData());
    const [rawDataMap, setRawDataMap] = useState(null);
    const [displayData, setDisplayData] = useState([]); // ★グラフ表示用

    // 入力用State
    const [newCampusName, setNewCampusName] = useState("");
    const [newCampusId, setNewCampusId] = useState("");
    const [newCampusSheetName, setNewCampusSheetName] = useState("");
    const [reportDate, setReportDate] = useState(formatDate(new Date()));
    const [dailyReport, setDailyReport] = useState({ weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    // ★追加: 保存用ローディングState
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    const [isSavingReport, setIsSavingReport] = useState(false);
    
    const [errorMsg, setErrorMsg] = useState(null);

    const selectedCampusName = useMemo(() => {
        if (selectedCampusId === 'All') return '全校舎 (合計)';
        const c = campusList.find(c => c.id === selectedCampusId);
        return c ? c.name : selectedCampusId;
    }, [selectedCampusId, campusList]);

    // --- Firebase Sync ---
    useEffect(() => {
        if (!isFirebaseInitialized || !db) { setIsLoading(false); return; }
        
        const unsubCampuses = onSnapshot(query(collection(db, "campuses"), orderBy("createdAt")), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, name: d.data().name || d.id, sheetName: d.data().sheetName || d.data().name || d.id }));
            setCampusList(list);
        }, (e) => { console.error(e); });

        const unsubEnroll = onSnapshot(query(collection(db, "enrollments")), (s) => setRealEnrollments(s.docs.map(d => ({id:d.id, ...d.data()}))));
        const unsubStatus = onSnapshot(query(collection(db, "status_changes")), (s) => setRealStatusChanges(s.docs.map(d => ({id:d.id, ...d.data()}))));
        const unsubTransfer = onSnapshot(query(collection(db, "transfers")), (s) => setRealTransfers(s.docs.map(d => ({id:d.id, ...d.data()}))));
        const unsubReports = onSnapshot(query(collection(db, "daily_reports")), (s) => setRealDailyReports(s.docs.map(d => ({id:d.id, ...d.data()}))));

        return () => { unsubCampuses(); unsubEnroll(); unsubStatus(); unsubTransfer(); unsubReports(); };
    }, []);

    // 計画データ取得
    useEffect(() => {
        if (selectedCampusId === 'All' || !isFirebaseInitialized) return;
        const fetchPlan = async () => {
            try {
                const snap = await getDoc(doc(db, "campus_plans", `${selectedCampusId}_${selectedYear}`));
                setPlanData(snap.exists() ? snap.data().plans : createInitialPlanData());
            } catch (e) { console.error(e); }
        };
        fetchPlan();
    }, [selectedCampusId, selectedYear]);

    // 日報データセット
    useEffect(() => {
        if (selectedCampusId === 'All') return;
        const r = realDailyReports.find(d => d.campusId === selectedCampusId && d.date === reportDate);
        setDailyReport(r ? { weather: r.weather, touchTry: r.touchTry, flyers: r.flyers, trialLessons: r.trialLessons } : { weather: 'sunny', touchTry: 0, flyers: 0, trialLessons: 0 });
    }, [reportDate, selectedCampusId, realDailyReports]);

    // --- 集計ロジック (rawDataMap生成) ---
    useEffect(() => {
        const generateData = async () => {
            setIsLoading(true);
            // 少し待ってUIブロッキングを避ける
            await new Promise(r => setTimeout(r, 100));
            const map = calculateData();
            setRawDataMap(map);
            setIsLoading(false);
        };
        generateData();
    }, [campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, selectedYear]);

    // ★修正: rawDataMap から 表示用データ(displayData) を生成する処理を追加
    useEffect(() => {
        if (!rawDataMap) return;

        const campusData = rawDataMap[selectedCampusId];
        if (!campusData) {
            setDisplayData([]);
            return;
        }

        let resultData = [];
        if (viewMode === 'annual') {
            resultData = campusData;
        } else if (viewMode === 'monthly') {
            const monthIndex = MONTHS_LIST.indexOf(selectedMonth);
            if (monthIndex !== -1 && campusData[monthIndex]) {
                resultData = campusData[monthIndex].daily;
            }
        } else if (viewMode === 'weekly') {
            const monthIndex = MONTHS_LIST.indexOf(selectedMonth);
            if (monthIndex !== -1 && campusData[monthIndex]) {
                resultData = campusData[monthIndex].weekly;
            }
        }
        setDisplayData(resultData);

    }, [rawDataMap, selectedCampusId, viewMode, selectedMonth]);


    const calculateData = () => {
        const dataMap = {};
        const sheetToId = {};
        campusList.forEach(c => {
            const key = c.sheetName || c.name;
            sheetToId[key] = c.id;
            sheetToId[normalizeString(key)] = c.id;
        });

        const resolveCampusId = (name) => sheetToId[name] || sheetToId[normalizeString(name)];

        const filterByYear = (list) => list.filter(i => {
            const d = new Date(i.date);
            return !isNaN(d) && getFiscalYear(d) === selectedYear;
        });
        const filterBeforeYear = (list) => list.filter(i => {
            const d = new Date(i.date);
            return !isNaN(d) && getFiscalYear(d) < selectedYear;
        });
        const countBy = (list, filterFn) => list.reduce((acc, i) => {
            const cid = resolveCampusId(i.campus);
            if (cid && (!filterFn || filterFn(i))) acc[cid] = (acc[cid] || 0) + 1;
            return acc;
        }, {});

        // 期首在庫
        const prevEnroll = countBy(filterBeforeYear(realEnrollments));
        const prevTransIn = countBy(filterBeforeYear(realTransfers));
        const prevWithdraw = countBy(filterBeforeYear(realStatusChanges), i => i.type?.includes('退会'));
        const prevTransOut = countBy(filterBeforeYear(realStatusChanges), i => i.type?.includes('転校'));
        const prevGrad = countBy(filterBeforeYear(realStatusChanges), i => i.type?.includes('卒業'));

        // 当年度データ
        const currEnroll = filterByYear(realEnrollments);
        const currTransIn = filterByYear(realTransfers);
        const currStatus = filterByYear(realStatusChanges);
        const currReports = filterByYear(realDailyReports);

        campusList.forEach(campus => {
            const cid = campus.id;
            let currentStudents = (prevEnroll[cid]||0) + (prevTransIn[cid]||0) - ((prevWithdraw[cid]||0) + (prevTransOut[cid]||0) + (prevGrad[cid]||0));

            dataMap[cid] = MONTHS_LIST.map((month, mIdx) => {
                const daily = Array.from({length: 30}, (_, d) => ({
                    name: `${d+1}日`,
                    newEnrollments: 0, transferIns: 0, returns: 0,
                    withdrawals: 0, transfers: 0, graduates: 0, recesses: 0,
                    flyers: 0, touchAndTry: 0, trialLessons: 0,
                    withdrawals_neg: 0, transfers_neg: 0, graduates_neg: 0, recesses_neg: 0
                }));

                const aggDay = (list, type, checkType=null) => {
                    list.forEach(item => {
                        if (resolveCampusId(item.campus) !== cid) return;
                        const d = new Date(item.date);
                        if (isNaN(d)) return;
                        if (getFiscalMonthIndexJST(d) !== mIdx) return;
                        if (checkType && (!item.type || !item.type.includes(checkType))) return;
                        const dayNum = getDayJST(d); 
                        const dayIdx = dayNum - 1;
                        if (daily[dayIdx]) daily[dayIdx][type]++;
                    });
                };

                aggDay(currEnroll, 'newEnrollments');
                aggDay(currTransIn, 'transferIns');
                aggDay(currStatus, 'returns', '復会');
                aggDay(currStatus, 'withdrawals', '退会');
                aggDay(currStatus, 'transfers', '転校');
                aggDay(currStatus, 'graduates', '卒業');
                aggDay(currStatus, 'recesses', '休会');

                currReports.forEach(r => {
                    if (r.campusId !== cid) return;
                    const d = new Date(r.date);
                    const reportM = d.getMonth();
                    const targetM = (mIdx + 3) % 12; 
                    if (reportM !== targetM) return;
                    const dayIdx = d.getDate() - 1;
                    if (daily[dayIdx]) {
                        daily[dayIdx].flyers += (r.flyers || 0);
                        daily[dayIdx].touchAndTry += (r.touchTry || 0);
                        daily[dayIdx].trialLessons += (r.trialLessons || 0);
                    }
                });

                let mVal = { enroll:0, transIn:0, ret:0, with:0, transOut:0, grad:0, rec:0, flyer:0, touch:0, trial:0 };
                daily.forEach(d => {
                    mVal.enroll += d.newEnrollments; mVal.transIn += d.transferIns; mVal.ret += d.returns;
                    mVal.with += d.withdrawals; mVal.transOut += d.transfers; mVal.grad += d.graduates; mVal.rec += d.recesses;
                    mVal.flyer += d.flyers; mVal.touch += d.touchAndTry; mVal.trial += d.trialLessons;
                    d.withdrawals_neg = -d.withdrawals;
                    d.transfers_neg = -d.transfers;
                    d.graduates_neg = -d.graduates;
                    d.recesses_neg = -d.recesses;
                });

                const netChange = (mVal.enroll + mVal.transIn) - (mVal.with + mVal.transOut + mVal.grad);
                currentStudents += netChange;

                const weekly = Array.from({length: 4}, (_, w) => {
                    const start = w * 7;
                    const end = w === 3 ? 30 : (w + 1) * 7;
                    const weekData = daily.slice(start, end).reduce((acc, d) => {
                        Object.keys(d).forEach(k => { if (typeof d[k] === 'number') acc[k] = (acc[k]||0) + d[k]; });
                        return acc;
                    }, {});
                    return { name: `第${w+1}週`, ...weekData, totalStudents: currentStudents };
                });
                daily.forEach(d => d.totalStudents = currentStudents);

                return {
                    name: month,
                    newEnrollments: mVal.enroll, transferIns: mVal.transIn, returns: mVal.ret,
                    withdrawals: mVal.with, transfers: mVal.transOut, graduates: mVal.grad, recesses: mVal.rec,
                    flyers: mVal.flyer, touchAndTry: mVal.touch, trialLessons: mVal.trial,
                    totalStudents: currentStudents,
                    withdrawals_neg: -mVal.with, transfers_neg: -mVal.transOut, graduates_neg: -mVal.grad, recesses_neg: -mVal.rec,
                    daily, weekly
                };
            });
        });

        // 全校舎合計
        dataMap['All'] = MONTHS_LIST.map((month, idx) => {
            const combined = { name: month, newEnrollments: 0, transferIns: 0, returns: 0, withdrawals: 0, transfers: 0, graduates: 0, recesses: 0, flyers: 0, touchAndTry: 0, trialLessons: 0, totalStudents: 0, withdrawals_neg: 0, transfers_neg: 0, graduates_neg: 0, recesses_neg: 0, daily: [], weekly: [] };
            for(let i=0; i<30; i++) combined.daily.push({name:`${i+1}日`, newEnrollments:0, transferIns:0, returns:0, withdrawals:0, transfers:0, graduates:0, recesses:0, flyers:0, touchAndTry:0, trialLessons:0, withdrawals_neg:0, transfers_neg:0, graduates_neg:0, recesses_neg:0});
            for(let i=0; i<4; i++) combined.weekly.push({name:`第${i+1}週`, newEnrollments:0, transferIns:0, returns:0, withdrawals:0, transfers:0, graduates:0, recesses:0, flyers:0, touchAndTry:0, trialLessons:0, withdrawals_neg:0, transfers_neg:0, graduates_neg:0, recesses_neg:0});

            campusList.forEach(c => {
                const d = dataMap[c.id]?.[idx];
                if (d) {
                    Object.keys(combined).forEach(k => { if (typeof combined[k] === 'number') combined[k] += d[k]; });
                    d.daily.forEach((day, i) => Object.keys(day).forEach(k => { if (typeof day[k] === 'number') combined.daily[i][k] += day[k]; }));
                    d.weekly.forEach((wk, i) => Object.keys(wk).forEach(k => { if (typeof wk[k] === 'number') combined.weekly[i][k] += wk[k]; }));
                }
            });
            return combined;
        });
        return dataMap;
    };

    // 校舎操作
    const handleAddCampus = async () => {
        const id = newCampusId.trim(), name = newCampusName.trim(), sheetName = newCampusSheetName.trim() || name;
        if (!id || !name) return alert("校舎IDと校舎名は必須です。");
        if (campusList.some(c => c.id === id)) return alert("ID重複");
        if (isFirebaseInitialized && db) await setDoc(doc(db, "campuses", id), { id, name, sheetName, createdAt: serverTimestamp() });
        setNewCampusId(""); setNewCampusName(""); setNewCampusSheetName("");
    };
    const handleDeleteCampus = async (targetId, targetName) => {
        if (!confirm(`${targetName} を削除しますか？`)) return;
        if (isFirebaseInitialized && db) {
            await deleteDoc(doc(db, "campuses", targetId));
            if (selectedCampusId === targetId) setSelectedCampusId('All');
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
    
    // ★修正: 計画データ保存処理
    const savePlanData = async () => {
        if (selectedCampusId === 'All') return;
        setIsSavingPlan(true); // 定義したstateを使用
        try {
            await setDoc(doc(db, "campus_plans", `${selectedCampusId}_${selectedYear}`), { campusId: selectedCampusId, year: selectedYear, plans: planData, updatedAt: serverTimestamp() });
            alert("保存しました。");
        } catch (e) { alert("保存失敗: " + e.message); } finally { setIsSavingPlan(false); }
    };
    
    // ★修正: 日報保存処理
    const handleSaveDailyReport = async () => {
        if (selectedCampusId === 'All') return;
        setIsSavingReport(true); // 定義したstateを使用
        try {
            await setDoc(doc(db, "daily_reports", `${selectedCampusId}_${reportDate}`), { campusId: selectedCampusId, date: reportDate, ...dailyReport, updatedAt: serverTimestamp() });
            alert("日報を保存しました。");
        } catch (e) { alert("保存失敗: " + e.message); } finally { setIsSavingReport(false); }
    };

    const todayEnrollmentsCount = useMemo(() => {
        if (!realEnrollments) return 0;
        const sheetNameToIdMap = {};
        campusList.forEach(c => {
            const key = c.sheetName || c.name;
            sheetNameToIdMap[key] = c.id;
            sheetNameToIdMap[normalizeString(key)] = c.id;
        });
        
        return realEnrollments.filter(e => {
            const d = new Date(e.date);
            if (isNaN(d.getTime())) return false;
            const jstD = new Date(d.getTime() + 9*60*60*1000);
            const jstY = jstD.getUTCFullYear();
            const jstM = ('0'+(jstD.getUTCMonth()+1)).slice(-2);
            const jstDay = ('0'+jstD.getUTCDate()).slice(-2);
            const dateStr = `${jstY}-${jstM}-${jstDay}`;
            
            const cId = sheetNameToIdMap[e.campus] || sheetNameToIdMap[normalizeString(e.campus)];
            return dateStr === reportDate && cId === selectedCampusId;
        }).length;
    }, [realEnrollments, reportDate, selectedCampusId, campusList]);

    const totals = useMemo(() => {
        if (!displayData || displayData.length === 0) return { newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0, budgetRevenue: 0, actualRevenue: 0, trialLessons: 0, flyers: 0, touchAndTry: 0 };
        return displayData.reduce((acc, curr) => ({
            budgetRevenue: acc.budgetRevenue + (curr.budgetRevenue || 0),
            actualRevenue: acc.actualRevenue + (curr.actualRevenue || 0),
            trialLessons: acc.trialLessons + (curr.trialLessons || 0),
            newEnrollments: acc.newEnrollments + (curr.newEnrollments || 0),
            transferIns: acc.transferIns + (curr.transferIns || 0),
            withdrawals: acc.withdrawals + (curr.withdrawals || 0),
            recesses: acc.recesses + (curr.recesses || 0),
            returns: acc.returns + (curr.returns || 0),
            transfers: acc.transfers + (curr.transfers || 0),
            graduates: acc.graduates + (curr.graduates || 0),
            flyers: acc.flyers + (curr.flyers || 0),
            touchAndTry: acc.touchAndTry + (curr.touchAndTry || 0),
        }), { newEnrollments: 0, transferIns: 0, withdrawals: 0, recesses: 0, returns: 0, transfers: 0, graduates: 0, budgetRevenue: 0, actualRevenue: 0, trialLessons: 0, flyers: 0, touchAndTry: 0 });
    }, [displayData]);

    const currentTotalStudents = displayData.length > 0 ? (viewMode === 'annual' ? displayData[displayData.length-1].totalStudents : displayData[0].totalStudents) : 0;
    
    if (isLoading && !rawDataMap) {
        return (<div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500"><Loader2 className="w-10 h-10 animate-spin mr-2" />Loading...</div>);
    }

    return (
        <div className="min-h-screen bg-slate-50 flex text-slate-900 font-sans">
            <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col">
                <div className="p-6 border-b border-slate-800">
                    <div className="flex items-center space-x-2"><TrendingUp className="w-5 h-5 text-white" /><span className="text-lg font-bold tracking-tight">RobotSchool<span className="text-blue-400">Dash</span></span></div>
                </div>
                <nav className="flex-1 p-3 space-y-1">
                    {[
                        {id: 'summary', icon: LayoutDashboard, label: '経営サマリー'},
                        {id: 'students', icon: Users, label: '生徒管理'},
                        {id: 'marketing', icon: Megaphone, label: '集客・販促'},
                        {id: 'campus_management', icon: School, label: '校舎管理'},
                    ].map(m => (
                        <button key={m.id} onClick={() => setActiveTab(m.id)} className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === m.id ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
                            <m.icon className="w-5 h-5" /><span>{m.label}</span>
                        </button>
                    ))}
                </nav>
                <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
                    <div className="flex items-center"><Database className={`w-3 h-3 mr-1 ${isFirebaseInitialized?'text-emerald-400':'text-gray-500'}`}/>{isFirebaseInitialized?'Connected':'Local Mode'}</div>
                    <div className="flex items-center"><MapPin className="w-3 h-3 mr-1"/>{selectedCampusName}</div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden h-screen">
                {errorMsg && <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4 mb-0 flex justify-between items-center text-red-700">{errorMsg}<button onClick={()=>setErrorMsg(null)}>×</button></div>}
                <header className="bg-white border-b h-16 flex items-center justify-between px-6 shrink-0">
                    <h1 className="text-xl font-bold text-slate-800">
                        {{summary:'経営サマリー', students:'生徒数・入退会管理', marketing:'集客活動・販促管理', campus_management:'校舎管理・日報・計画'}[activeTab]}
                    </h1>
                    <div className="flex items-center space-x-3">
                        {activeTab !== 'campus_management' && (
                            <>
                                <select value={selectedYear} onChange={e=>setSelectedYear(Number(e.target.value))} className="bg-slate-100 border-none rounded-lg text-sm px-3 py-1 font-bold">{YEARS_LIST.map(y=><option key={y} value={y}>{y}年度</option>)}</select>
                                <div className="flex bg-slate-100 rounded-lg p-1">
                                    {[{k:'annual',l:'年度'},{k:'monthly',l:'月度'},{k:'weekly',l:'週次'}].map(m=><button key={m.k} onClick={()=>setViewMode(m.k)} className={`px-3 py-1 text-xs rounded ${viewMode===m.k?'bg-white shadow text-blue-600':'text-slate-500'}`}>{m.l}</button>)}
                                </div>
                                {viewMode!=='annual' && <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="bg-slate-100 rounded-lg text-sm px-3 py-1">{MONTHS_LIST.map(m=><option key={m} value={m}>{m}</option>)}</select>}
                                <select value={selectedCampusId} onChange={e=>setSelectedCampusId(e.target.value)} className="bg-slate-100 rounded-lg text-sm px-3 py-1 font-bold"><option value="All">全校舎 (合計)</option>{campusList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {activeTab === 'campus_management' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                {selectedCampusId === 'All' ? (
                                    <div>
                                        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 mb-6 text-center">
                                            <h2 className="text-xl font-bold text-slate-800 mb-2">校舎を選択してください</h2>
                                            <p className="text-slate-500">計画入力、日報入力、設定を行う校舎を選択します。</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {campusList.map(c => (
                                                <button key={c.id} onClick={() => { setSelectedCampusId(c.id); setManageSubTab('plan'); }} className="p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all text-left group">
                                                    <div className="flex items-center mb-2">
                                                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold mr-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">{c.name.charAt(0)}</div>
                                                        <span className="font-bold text-lg text-slate-700">{c.name}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 ml-13">ID: {c.id}</p>
                                                </button>
                                            ))}
                                            <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400">
                                                <p className="text-sm mb-2">新しい校舎を追加</p>
                                                <div className="flex flex-col gap-2 w-full">
                                                    <input type="text" placeholder="ID (ex: shibuya)" value={newCampusId} onChange={e=>setNewCampusId(e.target.value)} className="px-2 py-1 text-sm border rounded" />
                                                    <input type="text" placeholder="校舎名" value={newCampusName} onChange={e=>setNewCampusName(e.target.value)} className="px-2 py-1 text-sm border rounded" />
                                                    <button onClick={handleAddCampus} disabled={!newCampusId||!newCampusName} className="bg-blue-600 text-white px-2 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50">追加</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 min-h-[600px] flex flex-col">
                                        <div className="border-b border-slate-100 p-4 flex justify-between items-center bg-slate-50 rounded-t-xl">
                                            <div className="flex items-center">
                                                <button onClick={() => setSelectedCampusId('All')} className="mr-4 p-2 hover:bg-slate-100 rounded-full text-slate-500"><ChevronLeft className="w-5 h-5" /></button>
                                                <div>
                                                    <h2 className="text-xl font-bold text-slate-800 flex items-center"><Building2 className="w-5 h-5 mr-2 text-blue-600" />{selectedCampusName} 管理</h2>
                                                </div>
                                            </div>
                                            <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg">
                                                {['plan', 'daily_report', 'settings'].map(tab => (
                                                    <button key={tab} onClick={() => setManageSubTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${manageSubTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                                        {tab === 'plan' && '年間計画'}
                                                        {tab === 'daily_report' && '日報入力'}
                                                        {tab === 'settings' && '設定'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="p-6 flex-1">
                                            {manageSubTab === 'plan' && (
                                                <div>
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h3 className="font-bold text-lg">年間計画入力 ({selectedYear}年度)</h3>
                                                        <button onClick={savePlanData} disabled={isSavingPlan} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"><Save size={16}/>保存</button>
                                                    </div>
                                                    <table className="w-full text-sm border-collapse">
                                                        <thead className="bg-slate-50 text-slate-600 border-b"><tr><th className="p-2">月</th><th className="p-2">入会目標</th><th className="p-2">体験会</th><th className="p-2">タッチ&トライ</th><th className="p-2">門配</th><th className="p-2">入会率</th></tr></thead>
                                                        <tbody className="divide-y">{MONTHS_LIST.map(m=><tr key={m}><td className="p-2 font-bold">{m}</td><td className="p-2"><input type="number" className="border rounded w-full p-1 text-right" value={planData[m]?.enrollments||0} onChange={e=>handlePlanChange(m,'enrollments',e.target.value)}/></td><td className="p-2"><input type="number" className="border rounded w-full p-1 text-right" value={planData[m]?.trials||0} onChange={e=>handlePlanChange(m,'trials',e.target.value)}/></td><td className="p-2"><input type="number" className="border rounded w-full p-1 text-right" value={planData[m]?.touchTry||0} onChange={e=>handlePlanChange(m,'touchTry',e.target.value)}/></td><td className="p-2"><input type="number" className="border rounded w-full p-1 text-right" value={planData[m]?.flyers||0} onChange={e=>handlePlanChange(m,'flyers',e.target.value)}/></td><td className="p-2 text-right">{planData[m]?.rate}%</td></tr>)}</tbody>
                                                    </table>
                                                </div>
                                            )}
                                            {manageSubTab === 'daily_report' && (
                                                <div className="max-w-lg mx-auto space-y-6">
                                                    <div className="flex justify-between items-center border-b pb-4"><h3 className="font-bold">日報入力</h3><input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} className="border rounded p-1"/></div>
                                                    <div><label className="block text-sm font-bold mb-2">天候</label><div className="flex gap-2">{[{id:'sunny',l:'晴',i:Sun,c:'text-orange-500'},{id:'cloudy',l:'曇',i:Cloud,c:'text-gray-500'},{id:'rainy',l:'雨',i:CloudRain,c:'text-blue-500'},{id:'snowy',l:'雪',i:Snowflake,c:'text-cyan-500'}].map(w=><button key={w.id} onClick={()=>setDailyReport({...dailyReport,weather:w.id})} className={`flex-1 flex items-center justify-center p-2 border rounded ${dailyReport.weather===w.id?'bg-blue-50 border-blue-500':''}`}><w.i className={`mr-2 ${w.c}`}/>{w.l}</button>)}</div></div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div><label className="block text-sm font-bold">タッチ＆トライ</label><input type="number" className="border rounded w-full p-2" value={dailyReport.touchTry} onChange={e=>setDailyReport({...dailyReport,touchTry:Number(e.target.value)})}/></div>
                                                        <div><label className="block text-sm font-bold">門配数</label><input type="number" className="border rounded w-full p-2" value={dailyReport.flyers} onChange={e=>setDailyReport({...dailyReport,flyers:Number(e.target.value)})}/></div>
                                                        <div><label className="block text-sm font-bold">体験会実施</label><input type="number" className="border rounded w-full p-2" value={dailyReport.trialLessons} onChange={e=>setDailyReport({...dailyReport,trialLessons:Number(e.target.value)})}/></div>
                                                        <div><label className="block text-sm font-bold">本日入会(自動)</label><div className="bg-slate-100 p-2 rounded text-center font-mono">{todayEnrollmentsCount} 名</div></div>
                                                    </div>
                                                    <button onClick={handleSaveDailyReport} disabled={isSavingReport} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"><Save className="inline mr-2"/>保存</button>
                                                </div>
                                            )}
                                            {manageSubTab === 'settings' && (
                                                <div className="max-w-lg mx-auto space-y-6">
                                                    <div><label className="block text-sm font-bold mb-1">スプレッドシート連携名</label><input className="border rounded w-full p-2 bg-slate-50" disabled value={campusList.find(c=>c.id===selectedCampusId)?.sheetName||''} /></div>
                                                    <button onClick={()=>handleDeleteCampus(selectedCampusId, selectedCampusName)} className="text-red-600 hover:bg-red-50 px-4 py-2 rounded border border-red-200 flex items-center"><Trash2 className="mr-2"/>この校舎を削除</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab !== 'campus_management' && (
                            <div className="space-y-6 animate-in fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    {activeTab === 'students' ? (
                                        <>
                                            <StatCard title="増加数" value={`${totals.newEnrollments+totals.transferIns+totals.returns}名`} subValue="入会+転入+復会" trend={0} icon={Users} color="bg-emerald-500" details={[{label:'入会',value:totals.newEnrollments},{label:'転入',value:totals.transferIns},{label:'復会',value:totals.returns}]} />
                                            <StatCard title="減少数" value={`${totals.withdrawals+totals.transfers+totals.graduates+totals.recesses}名`} subValue="退会+転出+卒業+休会" trend={0} icon={Users} color="bg-rose-500" details={[{label:'退会',value:totals.withdrawals},{label:'転出',value:totals.transfers},{label:'卒業',value:totals.graduates},{label:'休会',value:totals.recesses}]} />
                                            <StatCard title="純増数" value={`${(totals.newEnrollments+totals.transferIns+totals.returns)-(totals.withdrawals+totals.transfers+totals.graduates+totals.recesses)}名`} subValue="増加-減少" trend={0} icon={TrendingUp} color="bg-blue-500" />
                                            <StatCard title="在籍数" value={`${currentTotalStudents}名`} subValue="期末現在" trend={0} icon={School} color="bg-indigo-500" />
                                        </>
                                    ) : activeTab === 'marketing' ? (
                                        <>
                                            <StatCard title="門配数" value={`${totals.flyers}枚`} subValue="チラシ配布" trend={0} icon={Megaphone} color="bg-orange-500" />
                                            <StatCard title="タッチ&トライ" value={`${totals.touchAndTry}回`} subValue="イベント接触" trend={0} icon={Users} color="bg-blue-500" />
                                            <StatCard title="体験会" value={`${totals.trialLessons}回`} subValue="実施回数" trend={0} icon={Calendar} color="bg-indigo-500" />
                                            <StatCard title="入会数" value={`${totals.newEnrollments}名`} subValue="新規獲得" trend={0} icon={Activity} color="bg-emerald-500" />
                                        </>
                                    ) : (
                                        <>
                                            <StatCard title="売上" value={formatYen(0)} subValue="予算比 -" trend={0} icon={DollarSign} color="bg-blue-500" />
                                            <StatCard title="在籍数" value={`${currentTotalStudents}名`} subValue="期末現在" trend={0} icon={School} color="bg-indigo-500" />
                                            <StatCard title="入会数" value={`${totals.newEnrollments}名`} subValue="新規獲得" trend={0} icon={Activity} color="bg-emerald-500" />
                                            <StatCard title="体験会" value={`${totals.trialLessons}回`} subValue="実施回数" trend={0} icon={Calendar} color="bg-amber-500" />
                                        </>
                                    )}
                                </div>

                                <div className="bg-white p-6 rounded-xl border shadow-sm h-[400px]">
                                    <h3 className="font-bold text-lg mb-4">{activeTab==='students'?'生徒数増減フロー':activeTab==='marketing'?'集客ファネル':'主要指標推移'}</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={displayData} margin={{top:20,right:30,left:20,bottom:5}} stackOffset={activeTab==='students'?"sign":"none"}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" />
                                            <YAxis padding={{top:20, bottom:20}}/>
                                            <Tooltip />
                                            <Legend />
                                            <ReferenceLine y={0} stroke="#000" />
                                            {activeTab === 'students' ? (
                                                <>
                                                    <Bar dataKey="newEnrollments" name="入会" fill="#10b981" stackId="s" />
                                                    <Bar dataKey="transferIns" name="転入" fill="#06b6d4" stackId="s" />
                                                    <Bar dataKey="returns" name="復会" fill="#34d399" stackId="s" />
                                                    <Bar dataKey="withdrawals_neg" name="退会" fill="#ef4444" stackId="s" />
                                                    <Bar dataKey="transfers_neg" name="転出" fill="#f97316" stackId="s" />
                                                    <Bar dataKey="graduates_neg" name="卒業" fill="#a855f7" stackId="s" />
                                                    <Bar dataKey="recesses_neg" name="休会" fill="#f59e0b" stackId="s" />
                                                </>
                                            ) : activeTab === 'marketing' ? (
                                                <>
                                                    <Bar dataKey="flyers" name="門配" fill="#94a3b8" />
                                                    <Line type="monotone" dataKey="touchAndTry" name="T&T" stroke="#3b82f6" strokeWidth={2} />
                                                    <Line type="monotone" dataKey="trialLessons" name="体験会" stroke="#f59e0b" strokeWidth={2} />
                                                    <Line type="monotone" dataKey="newEnrollments" name="入会" stroke="#10b981" strokeWidth={3} />
                                                </>
                                            ) : (
                                                <>
                                                    <Bar dataKey="newEnrollments" name="入会" fill="#10b981" />
                                                    <Line type="monotone" dataKey="totalStudents" name="在籍数" stroke="#3b82f6" strokeWidth={2} />
                                                </>
                                            )}
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                {activeTab === 'students' && (
                                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                                        <div className="p-4 border-b font-bold">詳細データ</div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 text-slate-500 border-b"><tr><th className="px-4 py-2">期間</th><th className="px-4 py-2">入会</th><th className="px-4 py-2">転入</th><th className="px-4 py-2">復会</th><th className="px-4 py-2">退会</th><th className="px-4 py-2">転出</th><th className="px-4 py-2">卒業</th><th className="px-4 py-2">休会</th><th className="px-4 py-2 border-l">在籍</th></tr></thead>
                                                <tbody className="divide-y">{displayData.map((r,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-4 py-2">{r.name}</td><td className="px-4 py-2 text-emerald-600">{r.newEnrollments}</td><td className="px-4 py-2 text-cyan-600">{r.transferIns}</td><td className="px-4 py-2 text-emerald-600">{r.returns}</td><td className="px-4 py-2 text-rose-600">{r.withdrawals}</td><td className="px-4 py-2 text-orange-600">{r.transfers}</td><td className="px-4 py-2 text-purple-600">{r.graduates}</td><td className="px-4 py-2 text-amber-600">{r.recesses}</td><td className="px-4 py-2 font-bold border-l">{r.totalStudents}</td></tr>)}</tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
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
