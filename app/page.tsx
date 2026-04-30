'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

type MissionRef = {
  content: string | null
}

type ResponseItem = {
  id: string
  audio_url: string
  created_at: string
  missions: MissionRef | MissionRef[] | null
}

export default function GrandchildPage() {
  // ===== 화면 상태(방 생성/미션/응답 목록) =====
  const [nickname, setNickname] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [mission, setMission] = useState('')
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPostingMission, setIsPostingMission] = useState(false)
  const [responses, setResponses] = useState<ResponseItem[]>([])

  // 6자리 초대 코드 생성
  const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  // 가족 방 생성: families 테이블에 invite_code 저장
  const createFamily = async () => {
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) return alert('별명을 입력해주세요!')
    if (isLoading) return

    setIsLoading(true)
    const newCode = generateCode()

    const { data, error } = await supabase
      .from('families')
      .insert([{ invite_code: newCode }])
      .select()

    if (error) {
      alert('방 생성 실패: ' + error.message)
    } else if (data) {
      setInviteCode(newCode)
      setFamilyId(data[0].id)
    }
    setIsLoading(false)
  }

  // 미션 등록: missions 테이블에 family_id + content 저장
  const postMission = async () => {
    const trimmedMission = mission.trim()
    if (!trimmedMission || !familyId) return alert('미션 내용을 입력해주세요!')
    if (isPostingMission) return

    setIsPostingMission(true)
    const { error } = await supabase
      .from('missions')
      .insert([{ family_id: familyId, content: trimmedMission }])

    if (error) alert('미션 등록 실패')
    else {
      alert('미션이 등록되었습니다!')
      setMission('')
    }
    setIsPostingMission(false)
  }

  // 조부모님의 음성 응답을 가져오는 함수
  // 1) 내 방의 mission id 목록 조회 -> 2) 해당 mission들의 responses 조회
  const fetchResponses = useCallback(async () => {
    if (!familyId) return

    // 내 가족 방의 모든 미션 ID를 먼저 가져옵니다.
    const { data: missionData, error: missionError } = await supabase
      .from('missions')
      .select('id')
      .eq('family_id', familyId)

    if (missionError) return

    if (missionData && missionData.length > 0) {
      const missionIds = missionData.map(m => m.id)
      
      // 해당 미션들에 달린 응답들을 가져옵니다.
      const { data: responseData, error: responseError } = await supabase
        .from('responses')
        .select('*, missions(content)')
        .in('mission_id', missionIds)
        .order('created_at', { ascending: false })

      if (!responseError && responseData) setResponses(responseData as ResponseItem[])
      return
    }

    setResponses([])
  }, [familyId])

  // 5초마다 새로운 응답이 있는지 확인 (폴링)
  useEffect(() => {
    if (familyId) {
      const runFetch = () => {
        void fetchResponses()
      }
      runFetch()
      const interval = setInterval(runFetch, 5000)
      return () => clearInterval(interval)
    }
  }, [familyId, fetchResponses])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
      <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
        <h1 className="text-xl font-bold text-center text-slate-800 mb-8">손자용 모드</h1>
        
        {/* inviteCode가 없으면 "방 만들기", 있으면 "미션/응답 확인" 화면 */}
        {!inviteCode ? (
          <div className="flex flex-col gap-4">
            <input
              type="text" placeholder="나의 별명"
              className="w-full p-4 border border-slate-200 rounded-2xl text-black outline-none"
              value={nickname} onChange={(e) => setNickname(e.target.value)}
            />
            <button
              onClick={createFamily} disabled={isLoading}
              className="w-full p-4 font-bold text-white bg-blue-600 rounded-2xl active:scale-95 transition-transform"
            >
              새로운 가족 방 만들기
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-center p-6 bg-blue-50 rounded-2xl border-2 border-dashed border-blue-200">
              <p className="text-sm text-blue-600 mb-1">초대 코드</p>
              <span className="text-3xl font-mono font-black text-blue-700">{inviteCode}</span>
            </div>

            <div className="flex flex-col gap-3">
              <p className="font-semibold text-slate-700 text-sm">오늘의 미션 보내기</p>
              <textarea
                placeholder="예: 오늘 점심 뭐 드셨나요?"
                className="w-full p-4 border border-slate-200 rounded-2xl text-black h-24 resize-none outline-none"
                value={mission} onChange={(e) => setMission(e.target.value)}
              />
              <button
                onClick={postMission}
                disabled={isPostingMission}
                className="w-full p-4 font-bold text-white bg-emerald-500 rounded-2xl active:scale-95 transition-transform"
              >
                미션 전달하기
              </button>
            </div>

            <div className="h-px bg-slate-100 my-2" />

            <div className="flex flex-col gap-4">
              <p className="font-semibold text-slate-700 text-sm">도착한 음성 메시지</p>
              {/* responses는 최신순(created_at desc)으로 렌더링 */}
              {responses.length === 0 && <p className="text-xs text-slate-400 text-center">아직 도착한 음성이 없어요.</p>}
              {responses.map((res) => (
                <div key={res.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs text-blue-600 font-bold mb-2">
                    Q. {Array.isArray(res.missions) ? res.missions[0]?.content : res.missions?.content}
                  </p>
                  <audio src={res.audio_url} controls className="w-full h-8" />
                  <p className="text-[10px] text-slate-400 mt-2 text-right">
                    {new Date(res.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}