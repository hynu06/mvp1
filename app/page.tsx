'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'

type Role = 'grandchild' | 'grandparent'

type MissionRef = {
  content: string | null
}

type ResponseItem = {
  id: string
  audio_url: string
  created_at: string
  missions: MissionRef | MissionRef[] | null
}

type MissionItem = {
  id: string
  content: string
}
type NoticeTone = 'success' | 'error' | 'info'

const STORAGE_FAMILY_ID_KEY = 'grandparent_family_id'
const STORAGE_INVITE_CODE_KEY = 'grandparent_invite_code'
const STORAGE_ROLE_KEY = 'app_role'
const STORAGE_GRANDCHILD_INVITE_CODE_KEY = 'grandchild_invite_code'
const STORAGE_GRANDCHILD_FAMILY_ID_KEY = 'grandchild_family_id'

export default function HomePage() {
  const [role, setRole] = useState<Role | null>(() => {
    if (typeof window === 'undefined') return null
    const savedRole = window.localStorage.getItem(STORAGE_ROLE_KEY)
    if (savedRole === 'grandchild' || savedRole === 'grandparent') return savedRole
    return null
  })

  // 손자/손녀 상태
  const [nickname, setNickname] = useState('')
  const [inviteCode, setInviteCode] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(STORAGE_GRANDCHILD_INVITE_CODE_KEY) ?? ''
  })
  const [mission, setMission] = useState('')
  const [familyId, setFamilyId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(STORAGE_GRANDCHILD_FAMILY_ID_KEY)
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isPostingMission, setIsPostingMission] = useState(false)
  const [responses, setResponses] = useState<ResponseItem[]>([])
  const [grandchildNotice, setGrandchildNotice] = useState<{ tone: NoticeTone; text: string } | null>(null)

  // 할아버지/할머니 상태
  const [code, setCode] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(STORAGE_INVITE_CODE_KEY) ?? ''
  })
  const [isJoined, setIsJoined] = useState(() => {
    if (typeof window === 'undefined') return false
    return Boolean(window.localStorage.getItem(STORAGE_FAMILY_ID_KEY))
  })
  const [grandparentFamilyId, setGrandparentFamilyId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(STORAGE_FAMILY_ID_KEY)
  })
  const [currentMission, setCurrentMission] = useState<MissionItem | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [grandparentNotice, setGrandparentNotice] = useState<{ tone: NoticeTone; text: string } | null>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const mediaStream = useRef<MediaStream | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const handleSelectRole = (nextRole: Role) => {
    setRole(nextRole)
  }

  const handleResetRole = () => {
    window.localStorage.removeItem(STORAGE_ROLE_KEY)
    window.localStorage.removeItem(STORAGE_GRANDCHILD_INVITE_CODE_KEY)
    window.localStorage.removeItem(STORAGE_GRANDCHILD_FAMILY_ID_KEY)
    window.localStorage.removeItem(STORAGE_FAMILY_ID_KEY)
    window.localStorage.removeItem(STORAGE_INVITE_CODE_KEY)

    setNickname('')
    setInviteCode('')
    setMission('')
    setFamilyId(null)
    setResponses([])
    setGrandchildNotice(null)

    setCode('')
    setIsJoined(false)
    setGrandparentFamilyId(null)
    setCurrentMission(null)
    setAudioUrl(null)
    setIsRecording(false)
    setGrandparentNotice(null)
    setRole(null)
  }

  const showGrandchildNotice = (tone: NoticeTone, text: string) => {
    setGrandchildNotice({ tone, text })
  }

  const showGrandparentNotice = (tone: NoticeTone, text: string) => {
    setGrandparentNotice({ tone, text })
  }

  const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  const createFamily = async () => {
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) {
      showGrandchildNotice('error', '별명을 입력해주세요.')
      return
    }
    if (isLoading) return

    setIsLoading(true)
    const newCode = generateCode()

    const { data, error } = await supabase
      .from('families')
      .insert([{ invite_code: newCode }])
      .select()

    if (error) {
      showGrandchildNotice('error', '방 생성 실패: ' + error.message)
    } else if (data) {
      setInviteCode(newCode)
      setFamilyId(data[0].id)
      showGrandchildNotice('success', '가족 방이 생성되었습니다.')
    }
    setIsLoading(false)
  }

  const postMission = async () => {
    const trimmedMission = mission.trim()
    if (!trimmedMission || !familyId) {
      showGrandchildNotice('error', '미션 내용을 입력해주세요.')
      return
    }
    if (isPostingMission) return

    setIsPostingMission(true)
    const { error } = await supabase
      .from('missions')
      .insert([{ family_id: familyId, content: trimmedMission }])

    if (error) showGrandchildNotice('error', '미션 등록 실패')
    else {
      showGrandchildNotice('success', '미션이 등록되었습니다.')
      setMission('')
      await fetchResponses()
    }
    setIsPostingMission(false)
  }

  const fetchResponses = useCallback(async () => {
    if (!familyId) return

    const { data: missionData, error: missionError } = await supabase
      .from('missions')
      .select('id')
      .eq('family_id', familyId)

    if (missionError) return

    if (missionData && missionData.length > 0) {
      const missionIds = missionData.map(m => m.id)
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

  useEffect(() => {
    if (role) {
      window.localStorage.setItem(STORAGE_ROLE_KEY, role)
      return
    }
    window.localStorage.removeItem(STORAGE_ROLE_KEY)
  }, [role])

  useEffect(() => {
    if (inviteCode) {
      window.localStorage.setItem(STORAGE_GRANDCHILD_INVITE_CODE_KEY, inviteCode)
      return
    }
    window.localStorage.removeItem(STORAGE_GRANDCHILD_INVITE_CODE_KEY)
  }, [inviteCode])

  useEffect(() => {
    if (familyId) {
      window.localStorage.setItem(STORAGE_GRANDCHILD_FAMILY_ID_KEY, familyId)
      return
    }
    window.localStorage.removeItem(STORAGE_GRANDCHILD_FAMILY_ID_KEY)
  }, [familyId])

  useEffect(() => {
    if (code) {
      window.localStorage.setItem(STORAGE_INVITE_CODE_KEY, code)
      return
    }
    window.localStorage.removeItem(STORAGE_INVITE_CODE_KEY)
  }, [code])

  useEffect(() => {
    if (grandparentFamilyId) {
      window.localStorage.setItem(STORAGE_FAMILY_ID_KEY, grandparentFamilyId)
      return
    }
    window.localStorage.removeItem(STORAGE_FAMILY_ID_KEY)
  }, [grandparentFamilyId])

  useEffect(() => {
    if (role === 'grandchild' && familyId) {
      const runFetch = () => {
        void fetchResponses()
      }
      runFetch()
      const interval = setInterval(runFetch, 5000)
      return () => clearInterval(interval)
    }
  }, [role, familyId, fetchResponses])

  const joinFamily = async () => {
    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) {
      showGrandparentNotice('error', '코드를 입력해주세요.')
      return
    }

    const { data, error } = await supabase
      .from('families')
      .select('id')
      .eq('invite_code', normalizedCode)
      .single()

    if (error || !data) {
      showGrandparentNotice('error', '올바른 코드를 입력해주세요.')
      return
    }
    window.localStorage.setItem(STORAGE_FAMILY_ID_KEY, data.id)
    window.localStorage.setItem(STORAGE_INVITE_CODE_KEY, normalizedCode)
    setCode(normalizedCode)
    setGrandparentFamilyId(data.id)
    setIsJoined(true)
    showGrandparentNotice('success', '입장 완료! 최신 미션을 불러오는 중입니다.')
  }

  useEffect(() => {
    if (role === 'grandparent' && isJoined && grandparentFamilyId) {
      const fetchMission = async () => {
        const { data, error } = await supabase
          .from('missions')
          .select('id, content')
          .eq('family_id', grandparentFamilyId)
          .order('created_at', { ascending: false })
          .limit(1)

        if (error) return
        if (data && data.length > 0) setCurrentMission(data[0] as MissionItem)
      }
      void fetchMission()
    }
  }, [role, isJoined, grandparentFamilyId])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      mediaStream.current?.getTracks().forEach(track => track.stop())
    }
  }, [audioUrl])

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
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' })
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
        mediaStream.current?.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.current.start()
      setIsRecording(true)
    } catch {
      showGrandparentNotice('error', '마이크 권한이 필요합니다.')
    }
  }

  const stopRecording = () => {
    mediaRecorder.current?.stop()
    setIsRecording(false)
  }

  const saveResponse = async () => {
    if (!currentMission) {
      showGrandparentNotice('error', '아직 답변할 미션이 없습니다.')
      return
    }
    if (!audioChunks.current.length) {
      showGrandparentNotice('error', '녹음 파일을 먼저 준비해주세요.')
      return
    }
    if (isSaving) return
    setIsSaving(true)

    const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' })
    const fileName = `${Date.now()}.webm`

    const { error: uploadError } = await supabase.storage
      .from('audio_responses')
      .upload(fileName, audioBlob)

    if (uploadError) {
      setIsSaving(false)
      showGrandparentNotice('error', '업로드 실패')
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('audio_responses')
      .getPublicUrl(fileName)

    const { error: dbError } = await supabase
      .from('responses')
      .insert([{ mission_id: currentMission.id, audio_url: publicUrl }])

    if (dbError) showGrandparentNotice('error', 'DB 저장 실패: ' + dbError.message)
    else {
      showGrandparentNotice('success', '답변을 보냈습니다!')
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
      audioChunks.current = []
    }
    setIsSaving(false)
  }

  if (role === null) {
    if (!isHydrated) {
      return (
        <div className="min-h-screen bg-linear-to-b from-amber-50 to-orange-100 p-6 flex items-center justify-center">
          <p className="text-amber-800 text-sm">불러오는 중...</p>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-linear-to-b from-amber-50 to-orange-100 p-6 flex items-center justify-center">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-amber-900">가족 음성 미션</h1>
            <p className="text-amber-800 mt-2">어떤 역할로 시작할지 선택해 주세요</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <button
              onClick={() => handleSelectRole('grandchild')}
              className="text-left p-6 rounded-3xl bg-white border border-blue-100 shadow-sm hover:shadow-md transition"
            >
              <p className="text-sm text-blue-600 font-semibold">질문 보내는 사람</p>
              <h2 className="text-2xl font-black text-slate-800 mt-2">손자/손녀</h2>
              <p className="text-slate-500 mt-3 text-sm">가족 방을 만들고 오늘의 미션을 전달해요.</p>
            </button>
            <button
              onClick={() => handleSelectRole('grandparent')}
              className="text-left p-6 rounded-3xl bg-white border border-orange-100 shadow-sm hover:shadow-md transition"
            >
              <p className="text-sm text-orange-600 font-semibold">답장 보내는 사람</p>
              <h2 className="text-2xl font-black text-slate-800 mt-2">할아버지/할머니</h2>
              <p className="text-slate-500 mt-3 text-sm">코드로 입장하고 음성으로 답변을 보내요.</p>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (role === 'grandchild') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
        <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-sm border border-slate-100">
          <button onClick={handleResetRole} className="text-sm text-slate-500 hover:text-slate-700 mb-4">
            역할 다시 선택
          </button>
          <h1 className="text-xl font-bold text-center text-slate-800 mb-8">손자용 모드</h1>
          {grandchildNotice && (
            <p
              className={`mb-4 rounded-xl px-3 py-2 text-sm ${
                grandchildNotice.tone === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : grandchildNotice.tone === 'error'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              {grandchildNotice.text}
            </p>
          )}
          {!inviteCode ? (
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="나의 별명"
                className="w-full p-4 border border-slate-200 rounded-2xl text-black outline-none"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
              <button
                onClick={createFamily}
                disabled={isLoading}
                className="w-full p-4 font-bold text-white bg-blue-600 rounded-2xl active:scale-95 transition-transform disabled:opacity-60"
              >
                {isLoading ? '가족 방 만드는 중...' : '새로운 가족 방 만들기'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="text-center p-6 bg-blue-50 rounded-2xl border-2 border-dashed border-blue-200">
                <p className="text-sm text-blue-600 mb-1">초대 코드</p>
                <span className="text-3xl font-mono font-black text-blue-700">{inviteCode}</span>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteCode)
                    showGrandchildNotice('info', '초대 코드를 클립보드에 복사했습니다.')
                  }}
                  className="mt-3 text-xs text-blue-700 underline underline-offset-2"
                >
                  코드 복사하기
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <p className="font-semibold text-slate-700 text-sm">오늘의 미션 보내기</p>
                <textarea
                  placeholder="예: 오늘 점심 뭐 드셨나요?"
                  className="w-full p-4 border border-slate-200 rounded-2xl text-black h-24 resize-none outline-none"
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                />
                <button
                  onClick={postMission}
                  disabled={isPostingMission}
                  className="w-full p-4 font-bold text-white bg-emerald-500 rounded-2xl active:scale-95 transition-transform disabled:opacity-60"
                >
                  {isPostingMission ? '미션 전달 중...' : '미션 전달하기'}
                </button>
              </div>

              <div className="h-px bg-slate-100 my-2" />

              <div className="flex flex-col gap-4">
                <p className="font-semibold text-slate-700 text-sm">도착한 음성 메시지</p>
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-orange-50 p-6 text-black">
      <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-sm border border-orange-100">
        <button onClick={handleResetRole} className="text-sm text-slate-500 hover:text-slate-700 mb-4">
          역할 다시 선택
        </button>
        <h1 className="text-2xl font-black text-center text-orange-600 mb-8">할머니/할아버지 모드</h1>
        {grandparentNotice && (
          <p
            className={`mb-4 rounded-xl px-3 py-2 text-sm ${
              grandparentNotice.tone === 'success'
                ? 'bg-emerald-50 text-emerald-700'
                : grandparentNotice.tone === 'error'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-slate-100 text-slate-700'
            }`}
          >
            {grandparentNotice.text}
          </p>
        )}
        {!isJoined ? (
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="6자리 코드"
              className="w-full p-6 border-2 border-orange-200 rounded-2xl text-3xl text-center font-mono uppercase outline-none"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button onClick={joinFamily} className="w-full p-5 font-bold text-white text-xl bg-orange-500 rounded-2xl">
              입장하기
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 text-center">
            <div className="bg-orange-50 p-8 rounded-3xl">
              <p className="text-orange-600 font-bold mb-2">오늘의 미션</p>
              <h2 className="text-2xl font-bold">{currentMission ? currentMission.content : '미션 대기 중'}</h2>
            </div>

            <div className="flex flex-col gap-4">
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