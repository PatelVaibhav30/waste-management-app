'use client';
import { useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { Inter } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import "./globals.css";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { getAvailablerewards, getUserByEmail } from "@/utils/db/actions";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }: Readonly<{
  children: React.ReactNode;
}>) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);

  useEffect(() => {
    const fetchTotalEarnings = async () => {
      try {
        const userEmail = localStorage.getItem("userEmail");
        if(userEmail){
          const user = await getUserByEmail(userEmail);
          if(user){
            const availableRewards = await getAvailablerewards(user.id) as any;
            setTotalEarnings(availableRewards)
          }
        }
      }
      catch (e) {
        console.error("Error fetching total earnings:", e)
      }
    }
    fetchTotalEarnings()
  }, [])

  return (
    <SessionProvider>
      <html lang="en">
        <body className={inter.className}>

          <div className="min-h-screen flex bg-gray-100 flex-col">
            {/* header */}
            <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} totalEarnings={totalEarnings} />
            <div className="flex flex-1">
              {/* sidebar */}
              <Sidebar open={sidebarOpen} />
              <main className="flex-1 p-4 lg:p-8 ml-0 lg:ml-64 transition-all duration-300">
                {children}
              </main>
            </div>
          </div>
          <Toaster />
        </body>
      </html>
    </SessionProvider>
  )
}
