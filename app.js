import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from "recharts";
import { LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, DollarSign, Activity, Loader2, AlertCircle, MapPin, Settings, Plus, Trash2, School, Database, RefreshCw, Sun, Cloud, CloudRain, Snowflake, PenTool, ChevronDown, ChevronRight, Building, X, Ban, Upload, FileText, Save } from "lucide-react";
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
    CAMPUSES: 'dash_campuses', ENROLLMENTS: 'dash_enrollments', STATUS: 'dash_status',
    TRANSFERS: 'dash_transfers', DAILY_REPORTS: 'dash_daily_reports', TRIAL_APPS: 'dash_trial_apps',
    FINANCES: 'dash_finances', LAST_UPDATED: 'dash_last_updated'
};

// ★ 収支の勘定科目分類
const ACCOUNT_CLASSIFICATION = {
    'revenue': ['A51', '5100'],
    'labor': ['A63', '6300'],
    'selling': ['A61', 'A62', '6100', '6200'],
    'facility': ['A64', '6400'],
    'admin': ['A65', '6500']
};

let db = null;
let isFirebaseInitialized = false;
try {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    isFirebaseInitialized = true;
} catch (e) { console.error("Firebase Init Error:", e); }

// ==========================================
// Helper Functions
// ==========================================
const normalizeString = (str) => (!str ? "" : str.replace(/[\s\u3000]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
const parseDate = (dateValue) => {
    if (!dateValue) return null;
    if (typeof dateValue.toDate === 'function') return dateValue.toDate();
    if (dateValue.seconds) return new Date(dateValue.seconds * 1000);
    const d = new Date(dateValue);
    return isNaN(d.getTime()) ? null : d;
};
const formatDateStr = (date) => `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;
const getFiscalYear = (date) => (date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear());
const formatYen = (val) => `¥${Math.round(val || 0).toLocaleString()}`;

// ==========================================
// Main Component
// ==========================================
function RobotSchoolDashboard() {
    const today = new Date();
    const currentFiscalYear = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    const currentMonthStr = `${today.getMonth() + 1}月`;

    const [activeTab, setActiveTab] = useState('summary');
    const [selectedCampusId, setSelectedCampusId] = useState('All');
    const [selectedYear, setSelectedYear] = useState(currentFiscalYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [viewMode, setViewMode] = useState('monthly');

    const [campusList, setCampusList] = useState([]);
    const [realEnrollments, setRealEnrollments] = useState([]);
    const [realStatusChanges, setRealStatusChanges] = useState([]);
    const [realTransfers, setRealTransfers] = useState([]);
    const [realDailyReports, setRealDailyReports] = useState([]);
    const [realTrialApps, setRealTrialApps] = useState([]);
    const [realFinances, setRealFinances] = useState([]);

    const [rawDataMap, setRawDataMap] = useState(null);
    const [displayData, setDisplayData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    // CSVアップロード用
    const [uploadingCampusId, setUploadingCampusId] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const selectedCampusName = useMemo(() => {
        if (selectedCampusId === 'All') return '全校舎 (合計)';
        return campusList.find(c => c.id === selectedCampusId)?.name || selectedCampusId;
    }, [selectedCampusId, campusList]);

    // データ同期処理 
    const fetchFromFirebase = async () => {
        if (!db) return;
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
            setLastUpdated(new Date());

            // キャッシュ保存
            Object.keys(data).forEach(key => localStorage.setItem(`dash_${key}`, JSON.stringify(data[key])));
        } catch (e) { console.error("Sync error", e); } finally { setIsSyncing(false); }
    };

    useEffect(() => { fetchFromFirebase(); }, []);

    // CSVアップロード処理 [cite: 3, 2]
    const handleCSVUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !uploadingCampusId) return;
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
                        let val = Math.abs(parseFloat(cols[idx + 2]) || 0); // 基本的に絶対値で扱う
                        monthlyData[month][category] += val;
                    });
                }
            });

            try {
                await setDoc(doc(db, "campus_finances", `${uploadingCampusId}_${selectedYear}`), {
                    campusId: uploadingCampusId, year: selectedYear, monthlyData, updatedAt: serverTimestamp()
                });
                alert("保存完了");
                fetchFromFirebase();
            } catch (err) { alert(err.message); } finally { setIsUploading(false); }
        };
        reader.readAsText(file);
    };

    // ★ 統合集計ロジック 
    const generateData = () => {
        if (!campusList.length) return;
        const dataMap = {};
        const getResolvedCampusId = (rawName) => {
            const normInput = normalizeString(rawName);
            return campusList.find(c => normalizeString(c.name).includes(normInput) || normInput.includes(normalizeString(c.name)))?.id;
        };

        campusList.forEach(campusObj => {
            const cid = campusObj.id;
            const finance = realFinances.find(f => f.campusId === cid && f.year === selectedYear);
            let currentStudents = 0;

            dataMap[cid] = MONTHS_LIST.map((month, mIdx) => {
                const fData = finance?.monthlyData?.[month] || { revenue: 0, labor: 0, selling: 0, facility: 0, admin: 0 };
                
                // 生徒数計算
                const mEnroll = realEnrollments.filter(e => {
                    const d = parseDate(e.date);
                    return d && getFiscalYear(d) === selectedYear && (d.getMonth() + 9) % 12 === mIdx && getResolvedCampusId(e.campus) === cid;
                }).length;

                const mWithdraw = realStatusChanges.filter(s => {
                    const d = parseDate(s.date);
                    return d && getFiscalYear(d) === selectedYear && (d.getMonth() + 9) % 12 === mIdx && getResolvedCampusId(s.campus) === cid && (s.type?.includes("退会") || s.type?.includes("卒業"));
                }).length;

                currentStudents += (mEnroll - mWithdraw);

                return {
                    name: month,
                    actualRevenue: fData.revenue,
                    actualExpense: fData.labor + fData.selling + fData.facility + fData.admin,
                    newEnrollments: mEnroll,
                    withdrawals: mWithdraw,
                    totalStudents: currentStudents,
                    withdrawals_neg: -mWithdraw
                };
            });
        });

        // 全校舎合計
        dataMap['All'] = MONTHS_LIST.map((month, idx) => {
            const res = { name: month, actualRevenue: 0, actualExpense: 0, newEnrollments: 0, withdrawals: 0, totalStudents: 0, withdrawals_neg: 0 };
            campusList.forEach(c => {
                const d = dataMap[c.id][idx];
                Object.keys(res).forEach(k => { if (k !== 'name') res[k] += d[k]; });
            });
            return res;
        });

        setRawDataMap(dataMap);
        setIsLoading(false);
    };

    useEffect(() => { generateData(); }, [campusList, realEnrollments, realStatusChanges, realFinances, selectedYear]);

    useEffect(() => {
        if (rawDataMap) setDisplayData(rawDataMap[selectedCampusId] || []);
    }, [selectedCampusId, rawDataMap]);

    // 期間合計の計算 
    const totals = useMemo(() => {
        return displayData.reduce((acc, curr) => ({
            actualRevenue: acc.actualRevenue + (curr.actualRevenue || 0),
            actualExpense: acc.actualExpense + (curr.actualExpense || 0),
            newEnrollments: acc.newEnrollments + (curr.newEnrollments || 0),
            withdrawals: acc.withdrawals + (curr.withdrawals || 0),
        }), { actualRevenue: 0, actualExpense: 0, newEnrollments: 0, withdrawals: 0 });
    }, [displayData]);

    const currentStudents = displayData[displayData.length - 1]?.totalStudents || 0;

    if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col">
                <div className="p-6 font-bold text-xl border-b border-slate-800">RobotSchoolDash</div>
                <nav className="flex-1 p-4 space-y-2">
                    <button onClick={() => setActiveTab('summary')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'summary' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><LayoutDashboard /><span>経営サマリー</span></button>
                    <button onClick={() => setActiveTab('students')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'students' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Users /><span>生徒管理</span></button>
                    <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center space-x-3 p-3 rounded-lg ${activeTab === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings /><span>CSV・校舎設定</span></button>
                </nav>
            </aside>

            {/* Main */}
            <main className="flex-1 flex flex-col overflow-hidden h-screen">
                <header className="h-16 bg-white border-b flex items-center justify-between px-6 shrink-0">
                    <h1 className="font-bold text-lg">{selectedCampusName}</h1>
                    <div className="flex items-center space-x-3">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-slate-100 border-none rounded p-1 text-sm">{YEARS_LIST.map(y => <option key={y} value={y}>{y}年度</option>)}</select>
                        <select value={selectedCampusId} onChange={e => setSelectedCampusId(e.target.value)} className="bg-slate-100 border-none rounded p-1 text-sm"><option value="All">全校舎合計</option>{campusList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <button onClick={fetchFromFirebase} className="p-2"><RefreshCw className={isSyncing ? 'animate-spin' : ''} /></button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* サマリータブ: 収支と生徒数を同時に表示  */}
                    {activeTab === 'summary' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatCard title="売上実績" value={formatYen(totals.actualRevenue)} icon={DollarSign} color="bg-blue-500" subValue="年度合計" />
                                <StatCard title="在籍生徒" value={`${currentStudents}名`} icon={Users} color="bg-indigo-500" subValue="現在" />
                                <StatCard title="営業利益" value={formatYen(totals.actualRevenue - totals.actualExpense)} icon={TrendingUp} color="bg-emerald-500" subValue="収支差分" />
                                <StatCard title="期間入会" value={`${totals.newEnrollments}名`} icon={Plus} color="bg-amber-500" subValue="獲得数" />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-xl border h-[400px]">
                                    <h3 className="font-bold mb-6">収支推移 (売上 vs 経費)</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={displayData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip formatter={v => formatYen(v)} />
                                            <Legend />
                                            <Bar dataKey="actualRevenue" name="売上" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="actualExpense" name="経費" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="bg-white p-6 rounded-xl border h-[400px]">
                                    <h3 className="font-bold mb-6">在籍生徒数推移</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={displayData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip />
                                            <Legend />
                                            <Line type="monotone" dataKey="totalStudents" name="生徒数" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    )}

                    {/* 生徒管理タブ  */}
                    {activeTab === 'students' && (
                        <div className="bg-white p-6 rounded-xl border h-[450px]">
                            <h3 className="font-bold mb-6">生徒数増減フロー</h3>
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
                    )}

                    {/* 設定タブ: CSVアップロード [cite: 3, 2] */}
                    {activeTab === 'settings' && (
                        <div className="bg-white p-8 rounded-xl border max-w-2xl">
                            <h2 className="font-bold text-lg mb-6 flex items-center"><Upload className="mr-2" />収支CSVデータの取り込み</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">取り込み先校舎</label>
                                    <select value={uploadingCampusId} onChange={e => setUploadingCampusId(e.target.value)} className="w-full p-2 border rounded">
                                        <option value="">選択してください</option>
                                        {campusList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className={`border-2 border-dashed p-10 text-center rounded-lg ${!uploadingCampusId ? 'bg-slate-50 text-slate-400' : 'border-blue-300 hover:bg-blue-50'}`}>
                                    <input type="file" accept=".csv" onChange={handleCSVUpload} disabled={!uploadingCampusId || isUploading} className="hidden" id="csv-upload" />
                                    <label htmlFor="csv-upload" className="cursor-pointer block">
                                        {isUploading ? <Loader2 className="animate-spin mx-auto" /> : <FileText className="mx-auto mb-2" />}
                                        <p>{isUploading ? '処理中...' : 'CSVファイルを選択してアップロード'}</p>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

const StatCard = ({ title, value, subValue, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center justify-between">
        <div>
            <p className="text-sm text-slate-500 mb-1">{title}</p>
            <h3 className="text-2xl font-bold">{value}</h3>
            <p className="text-xs text-slate-400 mt-1">{subValue}</p>
        </div>
        <div className={`p-3 rounded-lg ${color} text-white`}><Icon /></div>
    </div>
);

const root = createRoot(document.getElementById('root'));
root.render(<RobotSchoolDashboard />);
