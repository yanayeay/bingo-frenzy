import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Minion Rush Craze | Club Info Center',description:'The shared Bingo Frenzy info center for Minion Rush Craze. Member Have and Need lists, assigned senders, and a club summary in one place.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
