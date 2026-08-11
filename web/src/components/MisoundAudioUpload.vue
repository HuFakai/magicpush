<template>
  <div class="w-full space-y-2">
    <div class="flex gap-2">
      <el-input
        :model-value="modelValue"
        placeholder="https://example.com/alert.mp3"
        clearable
        @update:model-value="emit('update:modelValue', $event)"
      />
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        accept=".mp3,.wav,.ogg,.flac,.m4a,.aac,audio/*"
        @change="handleFileChange"
      >
      <el-button :loading="uploading" :disabled="uploading" @click="openFilePicker">
        {{ uploading ? '上传中' : '上传音频' }}
      </el-button>
    </div>

    <el-progress
      v-if="uploading"
      :percentage="uploadProgress"
      :stroke-width="6"
      :show-text="true"
    />

    <audio
      v-if="hasPreview"
      :src="modelValue"
      controls
      preload="metadata"
      class="w-full h-9"
    />

    <p class="text-xs text-gray-500">
      可填写已有公网直链，或上传不超过 20MB 的 MP3、WAV、OGG、FLAC、M4A、AAC 文件；MP3 兼容性最佳。
    </p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { uploadMisoundAudio } from '@/api/misound'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const fileInput = ref(null)
const uploading = ref(false)
const uploadProgress = ref(0)

const hasPreview = computed(() => /^https?:\/\//i.test(String(props.modelValue || '').trim()))

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning('音频文件不能超过 20MB')
    return
  }

  uploading.value = true
  uploadProgress.value = 0
  try {
    const response = await uploadMisoundAudio(file, progressEvent => {
      if (progressEvent.total) {
        uploadProgress.value = Math.min(99, Math.round(progressEvent.loaded * 100 / progressEvent.total))
      }
    })
    if (response.success && response.data?.url) {
      uploadProgress.value = 100
      emit('update:modelValue', response.data.url)
      ElMessage.success('音频上传成功，在线地址已自动填入')
    }
  } finally {
    uploading.value = false
  }
}
</script>
