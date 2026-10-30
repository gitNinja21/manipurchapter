"use client";
import {useState} from "react";
import Link from "next/link";
import SelfieThemeControls from "@/components/admin/SelfieThemeControls";
import WorkDayControls from "@/components/WorkDayControls";
import ManualAttendance from "@/components/admin/ManualAttendance";
export default function AttendanceManagementPage(){
 const [revision,setRevision]=useState(0);
 return <div className="space-y-6">
  <div><h1 className="text-2xl font-bold">Attendance Management</h1><p className="text-sm text-foreground/65 mt-2">Open a Monday, close a date, or correct an employee’s attendance.</p><Link className="text-sm underline" href="/admin/attendance">View attendance records</Link></div>
  <SelfieThemeControls/>
  <WorkDayControls onChanged={()=>setRevision(n=>n+1)}/>
  <ManualAttendance dateRevision={revision} onSaved={()=>setRevision(n=>n+1)}/>
 </div>;
}
