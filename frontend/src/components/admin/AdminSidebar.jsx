import React from 'react';
import { LayoutDashboard, Users, Calendar, BarChart3, LogOut, Megaphone, X } from 'lucide-react';

const AdminSidebar = ({ activeTab, setActiveTab, onLogout, isMobileOpen, onMobileClose }) => {
    const menuItems = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'manage', label: 'Manage Election', icon: Users },
        { id: 'schedule', label: 'Schedule', icon: Calendar },
        { id: 'results', label: 'Results', icon: BarChart3 },
        { id: 'announcements', label: 'Announcements', icon: Megaphone },
    ];

    return (
        <>
            {isMobileOpen && (
                <button
                    type="button"
                    aria-label="Close navigation menu"
                    onClick={onMobileClose}
                    className="fixed inset-0 z-20 bg-black/60 md:hidden"
                />
            )}
        <aside className={`glass-panel w-64 h-screen fixed left-0 top-0 flex flex-col border-r border-white/10 z-30 transition-transform duration-300 md:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-6">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                            FOCMS Admin Portal
                        </h1>
                        <p className="text-gray-400 text-xs mt-1">Election Management System</p>
                    </div>
                    <button
                        type="button"
                        onClick={onMobileClose}
                        aria-label="Close navigation menu"
                        className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white md:hidden"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-2">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                setActiveTab(item.id);
                                onMobileClose();
                            }}
                            className={`
                w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300
                ${isActive
                                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                }
              `}
                        >
                            <Icon size={20} />
                            <span className="font-medium">{item.label}</span>
                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/10 space-y-2">
                <button
                    onClick={onLogout}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-300"
                >
                    <LogOut size={20} />
                    <span className="font-medium">Logout</span>
                </button>
            </div>
        </aside>
        </>
    );
};

export default AdminSidebar;
