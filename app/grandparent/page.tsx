'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type MissionItem = {
  id: string
  content: string
}

// 새로고침 후에도 조부모 입장 상태를 복원하기 위한 로컬 저장소 키
const STORAGE_FAMILY_ID_KEY = 'grandparent_family_id'
const STORAGE_INVITE_CODE_KEY = 'grandparent_invite_code'

export default function GrandparentPage() {
  // ===== 화면 상태(입장/미션/녹음) =====
  const [code, setCode] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [currentMission, setCurrentMission] = useState<MissionItem | null>(null)
  
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const mediaStream = useRef<MediaStream | null>(null)
  const audioChunks = useRef<Blob[]>([])

  // 최초 진입 시: 이전에 저장된 방 정보가 있으면 자동 복원
  useEffect(() => {
    const savedFamilyId = window.localStorage.getItem(STORAGE_FAMILY_ID_KEY)
    const savedCode = window.localStorage.getItem(STORAGE_INVITE_CODE_KEY)

    if (savedFamilyId) {
      setFamilyId(savedFamilyId)
      setIsJoined(true)
    }
    if (savedCode) {
      setCode(savedCode)
    }
  }, [])

  // 초대 코드로 families 테이블 조회 후 입장 처리
  const joinFamily = async () => {
    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) return alert('코드를 입력해주세요.')

    const { data, error } = await supabase
      .from('families')
      .select('id')
      .eq('invite_code', normalizedCode)
      .single()

    if (error || !data) return alert('올바른 코드를 입력해주세요.')
    window.localStorage.setItem(STORAGE_FAMILY_ID_KEY, data.id)
    window.localStorage.setItem(STORAGE_INVITE_CODE_KEY, normalizedCode)
    setCode(normalizedCode)
    setFamilyId(data.id)
    setIsJoined(true)
  }

  // 방 입장 후: 해당 family의 최신 미션 1개를 가져와 화면에 표시
  useEffect(() => {
    if (isJoined && familyId) {
      const fetchMission = async () => {
        const { data, error } = await supabase
          .from('missions')
          .select('id, content')
          .eq('family_id', familyId)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) return
        if (data && data.length > 0) setCurrentMission(data[0] as MissionItem)
      }
      fetchMission()
    }
  }, [isJoined, familyId])

  // 컴포넌트 종료 시: 생성한 오디오 URL/마이크 스트림 정리
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      mediaStream.current?.getTracks().forEach(track => track.stop())
    }
  }, [audioUrl])

  // 녹음 시작: 마이크 권한 요청 -> MediaRecorder 시작
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStream.current = stream
      mediaRecorder.current = new MediaRecorder(stream)
      audioChunks.current = []

      mediaRecorder.current.ondataavailable = (e) => {
        audioChunks.current.push(e.data)
      }

      mediaRecorder.current.onstop = () => {
        // 녹음 종료 시 Blob을 만들고 미리듣기 URL 생성
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' })
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
        mediaStream.current?.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.current.start()
      setIsRecording(true)
    } catch (err) {
      alert('마이크 권한이 필요합니다.')
    }
  }

  // 녹음 중지 버튼 핸들러
  const stopRecording = () => {
    mediaRecorder.current?.stop()
    setIsRecording(false)
  }

  // 손자에게 전송: Storage 업로드 -> public URL 생성 -> responses 테이블 저장
  const saveResponse = async () => {
    // 전송 전 필수 조건 검사
    if (!currentMission) {
      alert('아직 답변할 미션이 없습니다.')
      return
    }
    if (!audioChunks.current.length) {
      alert('녹음 파일을 먼저 준비해주세요.')
      return
    }
    if (isSaving) return
    setIsSaving(true)

    const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' })
    const fileName = `${Date.now()}.webm`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio_responses')
      .upload(fileName, audioBlob)

    if (uploadError) {
      setIsSaving(false)
      return alert('업로드 실패')
    }

    const { data: { publicUrl } } = supabase.storage
      .from('audio_responses')
      .getPublicUrl(fileName)

    const { error: dbError } = await supabase
      .from('responses')
      .insert([{ mission_id: currentMission.id, audio_url: publicUrl }])

    if (dbError) alert('DB 저장 실패: ' + dbError.message)
    else {
      alert('답변을 보냈습니다!')
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
      audioChunks.current = []
    }
    setIsSaving(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-orange-50 p-6 text-black">
      <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-sm border border-orange-100">
        <h1 className="text-2xl font-black text-center text-orange-600 mb-8">할머니/할아버지 모드</h1>

        {/* isJoined 여부에 따라 "코드 입력 화면" 또는 "미션/녹음 화면"을 분기 렌더링 */}
        {!isJoined ? (
          <div className="flex flex-col gap-4">
            <input
              type="text" placeholder="6자리 코드"
              className="w-full p-6 border-2 border-orange-200 rounded-2xl text-3xl text-center font-mono uppercase outline-none"
              value={code} onChange={(e) => setCode(e.target.value)}
            />
            <button onClick={joinFamily} className="w-full p-5 font-bold text-white text-xl bg-orange-500 rounded-2xl">
              입장하기
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 text-center">
            <div className="bg-orange-50 p-8 rounded-3xl">
              <p className="text-orange-600 font-bold mb-2">오늘의 미션</p>
              <h2 className="text-2xl font-bold">{currentMission ? currentMission.content : "미션 대기 중"}</h2>
            </div>

            <div className="flex flex-col gap-4">
              {/* 녹음 상태(isRecording)에 따라 시작/중단 버튼을 전환 */}
              {!isRecording ? (
                <button onClick={startRecording} className="p-6 bg-red-500 text-white rounded-full font-bold text-lg shadow-lg active:scale-95 transition-transform">
                  🎤 누르면 녹음 시작
                </button>
              ) : (
                <button onClick={stopRecording} className="p-6 bg-gray-800 text-white rounded-full font-bold text-lg animate-pulse">
                  ⏹️ 녹음 중단하기
                </button>
              )}

              {audioUrl && (
                <div className="mt-4 flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl">
                  <audio src={audioUrl} controls className="w-full" />
                  {!currentMission && (
                    <p className="text-xs text-amber-700 text-center">
                      현재 도착한 미션이 없어 전송할 수 없습니다.
                    </p>
                  )}
                  <button onClick={saveResponse} disabled={isSaving || !currentMission} className="p-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-colors disabled:opacity-60">
                    {/* 저장 중에는 중복 전송 방지를 위해 문구를 변경 */}
                    {isSaving ? '전송 중...' : '손자에게 보내기'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}