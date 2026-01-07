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
    CAMPUSES: 'dash_campuses',
    ENROLLMENTS: 'dash_enrollments',
    STATUS: 'dash_status',
    TRANSFERS: 'dash_transfers',
    DAILY_REPORTS: 'dash_daily_reports',
    TRIAL_APPS: 'dash_trial_apps', 
    FINANCES: 'dash_finances',
    LAST_UPDATED: 'dash_last_updated'
};

// ★ 勘定科目の分類定義
const ACCOUNT_CLASSIFICATION = {
    'revenue': ['A51', '5100'], // 売上
    'labor': ['A63', '6300'],   // 人件費
    'selling': ['A61', 'A62', '6100', '6200'], // 販売費・広告費
    'facility': ['A64', '6400'], // 設備費
    'admin': ['A65', '6500']    // 一般管理費
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

const formatYen = (val) => `¥${Math.round(val).toLocaleString()}`;

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
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isUsingCache, setIsUsingCache] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    // CSV Upload State
    const [uploadingCampusId, setUploadingCampusId] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const selectedCampusName = useMemo(() => {
        if (selectedCampusId === 'All') return '全校舎 (合計)';
        const campus = campusList.find(c => c.id === selectedCampusId);
        return campus ? campus.name : selectedCampusId;
    }, [selectedCampusId, campusList]);

    const loadFromCache = () => {
        try {
            const getCache = (key) => JSON.parse(localStorage.getItem(key));
            const cachedCampuses = getCache(CACHE_KEYS.CAMPUSES);
            const cachedTime = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);

            if (cachedCampuses) {
                setCampusList(cachedCampuses);
                setRealEnrollments(getCache(CACHE_KEYS.ENROLLMENTS) || []);
                setRealStatusChanges(getCache(CACHE_KEYS.STATUS) || []);
                setRealTransfers(getCache(CACHE_KEYS.TRANSFERS) || []);
                setRealDailyReports(getCache(CACHE_KEYS.DAILY_REPORTS) || []);
                setRealTrialApps(getCache(CACHE_KEYS.TRIAL_APPS) || []);
                setRealFinances(getCache(CACHE_KEYS.FINANCES) || []);
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
            const [campusSnap, enrollSnap, statusSnap, transferSnap, reportSnap, trialSnap, financeSnap] = await Promise.all([
                getDocs(query(collection(db, "campuses"), orderBy("createdAt"))),
                getDocs(collection(db, "enrollments")),
                getDocs(collection(db, "status_changes")),
                getDocs(collection(db, "transfers")),
                getDocs(collection(db, "daily_reports")),
                getDocs(collection(db, "trial_applications")),
                getDocs(collection(db, "campus_finances")) // ★追加
            ]);

            const data = {
                campuses: campusSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                enrollments: enrollSnap.docs.map(d => d.data()),
                status: statusSnap.docs.map(d => d.data()),
                transfers: transferSnap.docs.map(d => d.data()),
                reports: reportSnap.docs.map(d => d.data()),
                trialApps: trialSnap.docs.map(d => d.data()),
                finances: financeSnap.docs.map(d => d.data())
            };

            setCampusList(data.campuses);
            setRealEnrollments(data.enrollments);
            setRealStatusChanges(data.status);
            setRealTransfers(data.transfers);
            setRealDailyReports(data.reports);
            setRealTrialApps(data.trialApps);
            setRealFinances(data.finances);
            
            const now = new Date();
            setLastUpdated(now);
            setIsUsingCache(false);

            localStorage.setItem(CACHE_KEYS.CAMPUSES, JSON.stringify(data.campuses));
            localStorage.setItem(CACHE_KEYS.ENROLLMENTS, JSON.stringify(data.enrollments));
            localStorage.setItem(CACHE_KEYS.STATUS, JSON.stringify(data.status));
            localStorage.setItem(CACHE_KEYS.TRANSFERS, JSON.stringify(data.transfers));
            localStorage.setItem(CACHE_KEYS.DAILY_REPORTS, JSON.stringify(data.reports));
            localStorage.setItem(CACHE_KEYS.TRIAL_APPS, JSON.stringify(data.trialApps));
            localStorage.setItem(CACHE_KEYS.FINANCES, JSON.stringify(data.finances));
            localStorage.setItem(CACHE_KEYS.LAST_UPDATED, now.toISOString());
        } catch (e) {
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

    // CSV処理ロジック ★追加
    const handleCSVUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !uploadingCampusId) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target.result;
            const lines = text.split(/\r?\n/);
            const monthlyData = {};
            
            MONTHS_LIST.forEach(m => {
                monthlyData[m] = { revenue: 0, labor: 0, selling: 0, facility: 0, admin: 0 };
            });

            lines.slice(1).forEach(line => {
                const cols = line.split(',');
                if (cols.length < 15) return;
                const code = cols[0].trim();

                // カテゴリー判定 (二重計上を防ぐため、Aから始まる集計行のみを対象にする)
                let category = null;
                for (const [key, prefixes] of Object.entries(ACCOUNT_CLASSIFICATION)) {
                    if (prefixes.some(p => code.startsWith(p) && (code.length <= 5))) { // A51など短いコードを優先
                        category = key;
                        break;
                    }
                }

                if (category) {
                    MONTHS_LIST.forEach((month, idx) => {
                        let val = parseFloat(cols[idx + 2]) || 0;
                        if (category === 'revenue') val = Math.abs(val); // 売上は正の数に
                        monthlyData[month][category] += val;
                    });
                }
            });

            try {
                await setDoc(doc(db, "campus_finances", `${uploadingCampusId}_${selectedYear}`), {
                    campusId: uploadingCampusId,
                    year: selectedYear,
                    monthlyData,
                    updatedAt: serverTimestamp()
                });
                alert("収支データを保存しました。");
                fetchFromFirebaseAndCache();
            } catch (err) {
                alert("保存エラー: " + err.message);
            } finally {
                setIsUploading(false);
                e.target.value = "";
            }
        };
        reader.readAsText(file);
    };

    // 集計ロジック
    useEffect(() => {
        if (!campusList.length) return;
        const generateData = () => {
            const map = generateAllCampusesData(campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, realFinances, selectedYear);
            setRawDataMap(map);
        };
        generateData();
    }, [campusList, realEnrollments, realStatusChanges, realTransfers, realDailyReports, realTrialApps, realFinances, selectedYear]);

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
    // ★ 集計コアロジック
    // ==========================================
    const generateAllCampusesData = (targetCampuses, enrolls, status, transfers, reports, trials, finances, targetYear) => {
        const dataMap = {};
        
        const getResolvedCampusId = (rawName) => {
            if (!rawName) return null;
            const normInput = normalizeString(rawName);
            const match = targetCampuses.find(c => {
                const normCName = normalizeString(c.name);
                return normInput.includes(normCName) || normCName.includes(normInput);
            });
            return match ? match.id : null;
        };

        targetCampuses.forEach(campusObj => {
            const cid = campusObj.id;
            const myFinance = finances.find(f => f.campusId === cid && f.year === targetYear);
            
            let currentStudents = 0; // 簡易化のため初期値0（本来は前年度末から計算）

            dataMap[cid] = MONTHS_LIST.map((month, mIdx) => {
                const finance = myFinance?.monthlyData?.[month] || { revenue: 0, labor: 0, selling: 0, facility: 0, admin: 0 };
                
                // 生徒数計算（特定月の入退会を抽出）
                const mEnroll = enrolls.filter(e => {
                    const d = parseDate(e.date);
                    return d && getFiscalYear(d) === targetYear && (d.getMonth() + 9) % 12 === mIdx && getResolvedCampusId(e.campus) === cid;
                }).length;

                const mWithdraw = status.filter(s => {
                    const d = parseDate(s.date);
                    return d && getFiscalYear(d) === targetYear && (d.getMonth() + 9) % 12 === mIdx && getResolvedCampusId(s.campus) === cid && s.type?.includes("退会");
                }).length;

                currentStudents += (mEnroll - mWithdraw);

                return {
                    name: month,
                    actualRevenue: finance.revenue,
                    actualExpense: finance.labor + finance.selling + finance.facility + finance.admin,
                    newEnrollments: mEnroll,
                    withdrawals: mWithdraw,
                    totalStudents: currentStudents,
                    // グラフ用のネガティブ値
                    withdrawals_neg: -mWithdraw,
                    daily: [], // 簡易化のため空
                    weekly: []
                };
            });
        });

        // 全校舎合計
        dataMap['All'] = MONTHS_LIST.map((month, idx) => {
            const combined = { name: month, actualRevenue: 0, actualExpense: 0, newEnrollments: 0, withdrawals: 0, totalStudents: 0, withdrawals_neg: 0, daily: [], weekly: [] };
            targetCampuses.forEach(c => {
                const d = dataMap[c.id]?.[idx];
                if (d) {
                    combined.actualRevenue += d.actualRevenue;
                    combined.actualExpense += d.actualExpense;
                    combined.newEnrollments += d.newEnrollments;
                    combined.withdrawals += d.withdrawals;
                    combined.totalStudents += d.totalStudents;
                    combined.withdrawals_neg += d.withdrawals_neg;
                }
            });
            return combined;
        });

        return dataMap;
    };

    const totals = useMemo(() => {
        return (displayData || []).reduce((acc, curr) => ({
            actualRevenue: acc.actualRevenue + (curr.actualRevenue || 0),
            actualExpense: acc.actualExpense + (curr.actualExpense || 0),
            newEnrollments: acc.newEnrollments + (curr.newEnrollments || 0),
            withdrawals: acc.withdrawals + (curr.withdrawals || 0),
        }), { actualRevenue: 0, actualExpense: 0, newEnrollments: 0, withdrawals: 0 });
    }, [displayData]);

    if (isLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
                <div className="p-6 border-b border-slate-800 font-bold text-xl">RobotSchoolDash</div>
                <nav className="flex-1 p-4 space-y-2">
                    <button onClick={() => setActiveTab('summary')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'summary' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><LayoutDashboard className="w-5 h-5" /><span>経営サマリー</span></button>
                    <button onClick={() => setActiveTab('students')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'students' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Users className="w-5 h-5" /><span>生徒管理</span></button>
                    <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings className="w-5 h-5" /><span>設定・CSV連携</span></button>
                </nav>
                <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
                    Last Updated: {lastUpdated?.toLocaleTimeString()}
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden h-screen">
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
                    <h1 className="text-xl font-bold text-slate-800">{selectedCampusName}</h1>
                    <div className="flex items-center space-x-3">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-slate-100 border-none rounded-lg text-sm p-2">
                            {YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}
                        </select>
                        <select value={selectedCampusId} onChange={e => setSelectedCampusId(e.target.value)} className="bg-slate-100 border-none rounded-lg text-sm p-2">
                            <option value="All">全校舎合計</option>
                            {campusList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button onClick={fetchFromFirebaseAndCache} className="p-2 hover:bg-slate-100 rounded-lg"><RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /></button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'summary' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatCard title="売上実績" value={formatYen(totals.actualRevenue)} icon={DollarSign} color="bg-blue-500" trend={0} subValue="選択期間合計" />
                                <StatCard title="営業経費" value={formatYen(totals.actualExpense)} icon={Activity} color="bg-rose-500" trend={0} subValue="人件費・販売費等" />
                                <StatCard title="営業利益" value={formatYen(totals.actualRevenue - totals.actualExpense)} icon={TrendingUp} color="bg-emerald-500" trend={0} subValue="粗利推測" />
                                <StatCard title="期間入会" value={`${totals.newEnrollments}名`} icon={Plus} color="bg-indigo-500" trend={0} subValue="新規生徒" />
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[400px]">
                                <h3 className="text-lg font-bold mb-6">収支推移 (売上 vs 経費)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={displayData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" />
                                        <YAxis tickFormatter={v => `${v/10000}万`} />
                                        <Tooltip formatter={v => formatYen(v)} />
                                        <Legend />
                                        <Bar dataKey="actualRevenue" name="売上実績" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="actualExpense" name="営業経費" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                        <Line type="monotone" dataKey="totalStudents" name="在籍生徒数" stroke="#6366f1" yAxisId={0} strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}

                    {activeTab === 'settings' && (
                        <div className="max-w-4xl space-y-6">
                            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
                                <h2 className="text-lg font-bold mb-6 flex items-center"><Upload className="w-5 h-5 mr-2 text-blue-600" />収支データCSV連携</h2>
                                <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700 mb-6">
                                    校舎ごとの「収支計算表」CSVをアップロードしてください。勘定コードに基づき自動分類されます。
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">対象校舎</label>
                                        <select value={uploadingCampusId} onChange={e => setUploadingCampusId(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg">
                                            <option value="">校舎を選択してください</option>
                                            {campusList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={`flex items-center justify-center px-4 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${!uploadingCampusId ? 'bg-slate-50 border-slate-200 text-slate-400' : 'border-blue-300 hover:bg-blue-50 text-blue-600'}`}>
                                            {isUploading ? <Loader2 className="animate-spin mr-2" /> : <FileText className="mr-2" />}
                                            {isUploading ? '処理中...' : 'CSVファイルを選択'}
                                            <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} disabled={!uploadingCampusId || isUploading} />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

const StatCard = ({ title, value, subValue, trend, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
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
    </div>
);

const root = createRoot(document.getElementById('root'));
root.render(<RobotSchoolDashboard />);
