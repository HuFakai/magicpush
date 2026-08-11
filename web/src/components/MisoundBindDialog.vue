<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'rebind' ? '重新绑定小爱音箱' : '绑定小爱音箱'"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="step !== 'success'"
    :show-close="step !== 'polling'"
    @close="handleClose"
  >
    <!-- 步骤 1: 选择登录方式 -->
    <div v-if="step === 'select'" class="space-y-4">
      <!-- 已有账号列表 -->
      <div v-if="existingAccounts.length > 0">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">选择已登录的小米账号</p>
        <div class="space-y-2 mb-4">
          <div
            v-for="account in existingAccounts"
            :key="account.userId"
            class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 cursor-pointer transition-colors"
            :class="{ 'border-blue-500 bg-blue-50 dark:bg-blue-900/20': selectedAccount?.userId === account.userId }"
            @click="selectedAccount = account"
          >
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                小米账号 ({{ account.userId }})
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                已绑定 {{ account.channelCount }} 个设备
              </p>
            </div>
            <el-icon v-if="selectedAccount?.userId === account.userId" class="text-blue-500 text-xl">
              <CircleCheck />
            </el-icon>
          </div>
        </div>
        <el-divider>或</el-divider>
      </div>

      <!-- 扫码登录新账号 -->
      <el-button type="primary" class="w-full" @click="startQRLogin">
        扫码登录新的小米账号
      </el-button>
    </div>

    <!-- 步骤 2: 获取二维码 -->
    <div v-else-if="step === 'loading'" class="text-center py-12">
      <el-icon class="is-loading text-3xl text-gray-400"><Loading /></el-icon>
      <p class="text-sm text-gray-400 mt-3">正在获取登录二维码...</p>
    </div>

    <!-- 步骤 3: 展示二维码，等待扫码 -->
    <div v-else-if="step === 'qrcode' || step === 'polling'" class="text-center">
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        请使用<strong>小米手机/米家APP</strong>扫描下方二维码登录小米账号
      </p>

      <!-- 二维码 -->
      <div class="inline-block p-3 bg-white rounded-lg border border-gray-200">
        <QrcodeVue :value="qrCodeUrl" :size="220" level="M" />
      </div>

      <!-- 备选：手动打开链接 -->
      <div class="mt-3">
        <p class="text-xs text-gray-400">
          无法扫码？
          <a
            :href="loginUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-blue-500 hover:text-blue-700 underline"
          >点击此处打开链接手动登录</a>
        </p>
      </div>

      <!-- 状态提示 -->
      <div class="mt-4">
        <div v-if="step === 'polling'" class="flex items-center justify-center gap-2 text-sm text-gray-500">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>等待扫码中，请在小米手机上确认登录...</span>
        </div>
        <p v-if="step === 'qrcode'" class="text-sm text-amber-600">
          二维码有效期约 5 分钟
        </p>
      </div>

      <!-- 返回按钮 -->
      <div v-if="existingAccounts.length > 0" class="mt-4">
        <el-button text @click="step = 'select'">
          <el-icon class="mr-1"><ArrowLeft /></el-icon>
          返回选择账号
        </el-button>
      </div>
    </div>

    <!-- 步骤 4: 配置设备信息 -->
    <div v-else-if="step === 'config'" class="space-y-4">
      <!-- 登录成功提示 -->
      <div v-if="!selectedAccount" class="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg mb-4">
        <el-icon class="text-green-600"><SuccessFilled /></el-icon>
        <span class="text-sm text-green-700 dark:text-green-300">小米账号登录成功</span>
      </div>

      <!-- 配置表单 -->
      <el-form label-position="top">
        <el-form-item label="设备名称" required>
          <el-input
            v-model="deviceName"
            placeholder="请输入设备名称，如：客厅小爱"
            maxlength="50"
          />
          <p class="text-xs text-gray-500 mt-1">
            设备名称必须与米家 App 中的名称完全一致（注意大小写、空格）
          </p>
        </el-form-item>

        <el-form-item label="渠道名称">
          <el-input
            v-model="channelName"
            placeholder="小爱音箱"
            maxlength="50"
          />
        </el-form-item>

        <el-form-item label="TTS 模式">
          <el-select v-model="ttsMode" class="w-full">
            <el-option label="自动（推荐）" value="auto" />
            <el-option label="指令模式" value="command" />
            <el-option label="默认链路" value="default" />
          </el-select>
          <p class="text-xs text-gray-500 mt-1">
            auto=智能选择最优方式；command=仅用MiOT指令；default=仅用MiNA默认链路
          </p>
        </el-form-item>

        <el-form-item label="开始音量">
          <el-input
            v-model="startVolume"
            type="number"
            min="0"
            max="100"
            placeholder="0-100，留空表示不调节"
          />
          <p class="text-xs text-gray-500 mt-1">
            播报前设置的音量。留空则不修改音箱当前音量
          </p>
        </el-form-item>

        <el-form-item label="结束音量">
          <el-input
            v-model="endVolume"
            type="number"
            min="0"
            max="100"
            placeholder="0-100，留空表示不调节"
          />
          <p class="text-xs text-gray-500 mt-1">
            播报结束后设置的音量。留空则不修改
          </p>
        </el-form-item>

        <el-form-item label="播放次数">
          <el-input
            v-model="playCount"
            type="number"
            min="1"
            max="10"
            placeholder="默认 1，最大 10"
          />
          <p class="text-xs text-gray-500 mt-1">
            同一条消息重复播放的次数，默认 1
          </p>
        </el-form-item>

        <el-form-item label="播放间隔（秒）">
          <el-input
            v-model="playInterval"
            type="number"
            min="0"
            max="300"
            placeholder="默认 0"
          />
          <p class="text-xs text-gray-500 mt-1">
            多次播放时两次之间的等待秒数
          </p>
        </el-form-item>

        <el-form-item label="在线音频 URL">
          <MisoundAudioUpload v-model="audioUrl" />
        </el-form-item>

        <el-form-item label="结束音量延迟（秒）">
          <el-input
            v-model="endVolumeDelay"
            type="number"
            min="0"
            max="300"
            placeholder="留空=自动估算"
          />
          <p class="text-xs text-gray-500 mt-1">
            设置结束音量前的等待秒数。留空则按 TTS 文本长度自动估算
          </p>
        </el-form-item>
      </el-form>
    </div>

    <!-- 步骤 5: 绑定成功 -->
    <div v-else-if="step === 'success'" class="text-center py-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
        <el-icon class="text-3xl text-green-600 dark:text-green-400"><SuccessFilled /></el-icon>
      </div>
      <p class="text-lg font-medium text-green-700 dark:text-green-400 mb-2">绑定成功</p>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        已绑定到「{{ boundDeviceName }}」
      </p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="step === 'error'" class="text-center py-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
        <el-icon class="text-3xl text-red-600 dark:text-red-400"><WarningFilled /></el-icon>
      </div>
      <p class="text-lg font-medium text-red-700 dark:text-red-400 mb-2">操作失败</p>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{{ errorMsg }}</p>
      <el-button type="primary" @click="reset">重新开始</el-button>
    </div>

    <!-- 二维码过期 -->
    <div v-else-if="step === 'expired'" class="text-center py-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
        <el-icon class="text-3xl text-amber-600 dark:text-amber-400"><WarningFilled /></el-icon>
      </div>
      <p class="text-lg font-medium text-amber-700 dark:text-amber-400 mb-2">二维码已过期</p>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">请重新获取二维码</p>
      <el-button type="primary" @click="startQRLogin">刷新二维码</el-button>
    </div>

    <template #footer>
      <template v-if="step === 'select'">
        <el-button @click="handleClose">取消</el-button>
        <el-button
          type="primary"
          :disabled="!selectedAccount"
          @click="useExistingAccount"
        >
          使用选中的账号
        </el-button>
      </template>
      <template v-else-if="step === 'config'">
        <el-button @click="handleClose">取消</el-button>
        <el-button
          type="primary"
          :disabled="!deviceName.trim() || binding"
          :loading="binding"
          @click="handleConfirm"
        >
          {{ mode === 'rebind' ? '确认重新绑定' : '确认绑定' }}
        </el-button>
      </template>
      <template v-else-if="step === 'success'">
        <el-button type="primary" @click="handleSuccess">完成</el-button>
      </template>
      <template v-else-if="step !== 'loading' && step !== 'polling'">
        <el-button @click="handleClose">取消</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, SuccessFilled, WarningFilled, CircleCheck, ArrowLeft } from '@element-plus/icons-vue'
import QrcodeVue from 'qrcode.vue'
import { initMiQRLogin, pollMiQRStatus, confirmMiBind, rebindMiChannel } from '@/api/misound'
import { getChannels } from '@/api/channel'
import MisoundAudioUpload from '@/components/MisoundAudioUpload.vue'

const props = defineProps({
  visible: Boolean,
  mode: { type: String, default: 'create' },
  channelId: Number,
})
const emit = defineEmits(['update:visible', 'success'])

// 状态
const step = ref('idle')  // idle | select | loading | qrcode | polling | config | success | error | expired
const errorMsg = ref('')

// 已有账号列表
const existingAccounts = ref([])
const selectedAccount = ref(null)

// 扫码相关
const qrCodeUrl = ref('')
const loginUrl = ref('')
const sessionId = ref('')
const credentials = ref({})

// 配置表单
const deviceName = ref('')
const channelName = ref('小爱音箱')
const ttsMode = ref('auto')
// 播放增强配置（均为可选）
const startVolume = ref('')
const endVolume = ref('')
const playCount = ref('1')
const playInterval = ref('0')
const audioUrl = ref('')
const endVolumeDelay = ref('')
const binding = ref(false)
const boundDeviceName = ref('')

// 防止重复轮询
let isPolling = false
let startPollingTimer = null
let pollTimer = null

function schedulePoll(delay) {
  if (!isPolling) return
  clearTimeout(pollTimer)
  pollTimer = setTimeout(() => {
    pollTimer = null
    doPoll()
  }, delay)
}

watch(() => props.visible, (val) => {
  if (val) {
    loadExistingAccounts()
  } else {
    cleanup()
  }
})

/**
 * 加载已有的小米账号
 */
async function loadExistingAccounts() {
  try {
    const res = await getChannels()
    if (res.success && res.data) {
      // 从已有的 misound 渠道中提取唯一的账号
      const channels = res.data.filter(ch => ch.channel_type === 'misound' && ch.config)
      const targetChannel = props.mode === 'rebind'
        ? channels.find(channel => channel.id === props.channelId)
        : null
      if (targetChannel) {
        prefillChannelConfig(targetChannel)
      }
      const accountMap = new Map()
      
      channels.forEach(channel => {
        const userId = channel.config.userId
        if (userId) {
          if (!accountMap.has(userId)) {
            accountMap.set(userId, {
              userId,
              passToken: channel.config.passToken,
              channelCount: 0,
            })
          }
          accountMap.get(userId).channelCount++
        }
      })
      
      existingAccounts.value = Array.from(accountMap.values())
      if (targetChannel) {
        selectedAccount.value = existingAccounts.value.find(
          account => account.userId === targetChannel.config.userId
        ) || null
      }
      
      // 如果有已有账号，显示选择界面；否则直接进入扫码
      if (existingAccounts.value.length > 0) {
        step.value = 'select'
      } else {
        startQRLogin()
      }
    } else {
      // 没有已有账号，直接扫码
      startQRLogin()
    }
  } catch {
    // 加载已有账号失败，直接进入扫码流程
    startQRLogin()
  }
}

function prefillChannelConfig(channel) {
  const config = channel.config || {}
  const optionalValue = value => value === undefined || value === null ? '' : String(value)
  deviceName.value = optionalValue(config.did)
  channelName.value = channel.name || '小爱音箱'
  ttsMode.value = config.ttsMode || 'auto'
  startVolume.value = optionalValue(config.startVolume)
  endVolume.value = optionalValue(config.endVolume)
  playCount.value = optionalValue(config.playCount) || '1'
  playInterval.value = optionalValue(config.playInterval) || '0'
  audioUrl.value = optionalValue(config.audioUrl)
  endVolumeDelay.value = optionalValue(config.endVolumeDelay)
}

/**
 * 使用已有账号
 */
function useExistingAccount() {
  if (!selectedAccount.value) {
    ElMessage.warning('请选择一个账号')
    return
  }
  
  credentials.value = {
    userId: selectedAccount.value.userId,
    passToken: selectedAccount.value.passToken,
  }
  
  step.value = 'config'
}

/**
 * 开始扫码登录
 */
function startQRLogin() {
  selectedAccount.value = null
  fetchQRCode()
}

/**
 * 获取登录二维码
 */
async function fetchQRCode() {
  step.value = 'loading'
  errorMsg.value = ''

  try {
    const res = await initMiQRLogin()
    if (res.success && res.data) {
      qrCodeUrl.value = res.data.qrCodeUrl
      loginUrl.value = res.data.loginUrl
      sessionId.value = res.data.sessionId
      step.value = 'qrcode'

      clearTimeout(startPollingTimer)
      startPollingTimer = setTimeout(() => {
        startPollingTimer = null
        if (props.visible && step.value === 'qrcode') {
          startPolling()
        }
      }, 1000)
    } else {
      step.value = 'error'
      errorMsg.value = res.message || '获取二维码失败'
    }
  } catch (error) {
    step.value = 'error'
    errorMsg.value = error.message || '获取二维码失败，请检查网络连接'
  }
}

/**
 * 开始轮询扫码状态
 */
function startPolling() {
  if (isPolling) return
  isPolling = true
  step.value = 'polling'
  doPoll()
}

/**
 * 执行一次轮询
 */
async function doPoll() {
  if (!sessionId.value || !isPolling) return

  try {
    const res = await pollMiQRStatus(sessionId.value)

    if (!res.success || !res.data) {
      schedulePoll(3000)
      return
    }

    switch (res.data.status) {
      case 'confirmed':
        isPolling = false
        credentials.value = {
          userId: res.data.userId,
          passToken: res.data.passToken,
        }
        step.value = 'config'
        break

      case 'expired':
        isPolling = false
        step.value = 'expired'
        break

      case 'canceled':
        isPolling = false
        step.value = 'expired'
        errorMsg.value = '用户取消了登录'
        break

      case 'failed':
        isPolling = false
        step.value = 'error'
        errorMsg.value = res.data.message || '扫码失败'
        break

      default:
        schedulePoll(2000)
        break
    }
  } catch {
    schedulePoll(5000)
  }
}

/**
 * 组装可选播放配置；空字符串转为 undefined，避免后端写入空串干扰校验时仍可留空
 */
function buildPlaybackPayload() {
  const optionalNumberOrUndefined = (rawValue) => {
    const trimmed = String(rawValue ?? '').trim()
    return trimmed === '' ? undefined : trimmed
  }
  return {
    startVolume: optionalNumberOrUndefined(startVolume.value),
    endVolume: optionalNumberOrUndefined(endVolume.value),
    playCount: optionalNumberOrUndefined(playCount.value) ?? '1',
    playInterval: optionalNumberOrUndefined(playInterval.value) ?? '0',
    audioUrl: String(audioUrl.value || '').trim() || undefined,
    endVolumeDelay: optionalNumberOrUndefined(endVolumeDelay.value),
  }
}

/**
 * 确认绑定
 */
async function handleConfirm() {
  const did = deviceName.value.trim()
  
  if (!did) {
    ElMessage.warning('请输入设备名称')
    return
  }

  binding.value = true

  try {
    let res
    if (props.mode === 'rebind' && props.channelId) {
      res = await rebindMiChannel(props.channelId, {
        userId: credentials.value.userId,
        passToken: credentials.value.passToken,
        did,
        name: channelName.value || '小爱音箱',
        ttsMode: ttsMode.value,
        ...buildPlaybackPayload(),
      })
    } else {
      res = await confirmMiBind({
        userId: credentials.value.userId,
        passToken: credentials.value.passToken,
        did,
        name: channelName.value || '小爱音箱',
        ttsMode: ttsMode.value,
        ...buildPlaybackPayload(),
      })
    }

    if (res.success) {
      boundDeviceName.value = channelName.value || did
      step.value = 'success'
    } else {
      ElMessage.error(res.message || '绑定失败')
    }
  } catch (error) {
    ElMessage.error(error.message || '绑定失败')
  } finally {
    binding.value = false
  }
}

function handleClose() {
  if (step.value === 'polling') return
  cleanup()
  emit('update:visible', false)
}

function handleSuccess() {
  emit('success')
  cleanup()
  emit('update:visible', false)
}

function reset() {
  cleanup()
  loadExistingAccounts()
}

function cleanup() {
  isPolling = false
  clearTimeout(startPollingTimer)
  clearTimeout(pollTimer)
  startPollingTimer = null
  pollTimer = null
  step.value = 'idle'
  qrCodeUrl.value = ''
  loginUrl.value = ''
  sessionId.value = ''
  credentials.value = {}
  selectedAccount.value = null
  deviceName.value = ''
  channelName.value = '小爱音箱'
  ttsMode.value = 'auto'
  startVolume.value = ''
  endVolume.value = ''
  playCount.value = '1'
  playInterval.value = '0'
  audioUrl.value = ''
  endVolumeDelay.value = ''
  binding.value = false
  boundDeviceName.value = ''
  errorMsg.value = ''
}

onUnmounted(cleanup)
</script>
