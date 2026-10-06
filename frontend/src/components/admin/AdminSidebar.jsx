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
                    className="fixed inset-0 z-30 bg-black/60 md:hidden"
                />
            )}
        <aside className={`glass-panel fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/10 transition-[width] duration-300 ${isMobileOpen ? 'w-64' : 'w-16 md:w-64'}`}>
            <div className={`${isMobileOpen ? 'p-6' : 'p-3 md:p-6'}`}>
                <div className={`flex items-start ${isMobileOpen ? 'justify-between gap-2' : 'justify-center md:justify-between'}`}>
                    <div>
                        <h1 className={`${isMobileOpen ? 'block' : 'hidden md:block'} text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400`}>
                            FOCMS Admin Portal
                        </h1>
                        <p className={`${isMobileOpen ? 'block' : 'hidden md:block'} text-gray-400 text-xs mt-1`}>Election Management System</p>
                    </div>
                    {!isMobileOpen && (
                        <span className="text-sm font-bold text-indigo-300 md:hidden" aria-hidden="true">F</span>
                    )}
                    <button
                        type="button"
                        onClick={onMobileClose}
                        aria-label="Close navigation menu"
                        className={`rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white ${isMobileOpen ? 'block' : 'hidden'} md:hidden`}
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            <nav className={`flex-1 space-y-2 ${isMobileOpen ? 'px-4' : 'px-2 md:px-4'}`}>
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
                            title={!isMobileOpen ? item.label : undefined}
                            aria-label={item.label}
                            className={`
                w-full flex items-center ${isMobileOpen ? 'justify-start space-x-3 px-4' : 'justify-center px-0 md:justify-start md:space-x-3 md:px-4'} py-3 rounded-xl transition-all duration-300
                ${isActive
                                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                }
              `}
                        >
                            <Icon size={20} />
                            <span className={`${isMobileOpen ? 'inline' : 'hidden md:inline'} font-medium`}>{item.label}</span>
                            {isActive && (
                                <div className={`${isMobileOpen ? 'block' : 'hidden md:block'} ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]`} />
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className={`border-t border-white/10 ${isMobileOpen ? 'p-4' : 'p-2 md:p-4'}`}>
                <button
                    onClick={onLogout}
                    title={!isMobileOpen ? 'Logout' : undefined}
                    aria-label="Logout"
                    className={`w-full flex items-center ${isMobileOpen ? 'justify-start space-x-3 px-4' : 'justify-center px-0 md:justify-start md:space-x-3 md:px-4'} py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-300`}
                >
                    <LogOut size={20} />
                    <span className={`${isMobileOpen ? 'inline' : 'hidden md:inline'} font-medium`}>Logout</span>
                </button>
            </div>
        </aside>
        </>
    );
};

export default AdminSidebar;
