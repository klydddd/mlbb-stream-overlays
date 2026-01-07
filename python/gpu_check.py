"""
GPU Diagnostic Script
Run this to check if TensorFlow can detect and use your GPU
"""
import tensorflow as tf
import sys
import os

# Fix encoding for Windows console
os.environ['PYTHONIOENCODING'] = 'utf-8'

print("=" * 60)
print("TensorFlow GPU Diagnostic")
print("=" * 60)

# TensorFlow version
print(f"\nTensorFlow Version: {tf.__version__}")

# Check for GPU devices
print("\nGPU Devices:")
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    print(f"[OK] Found {len(gpus)} GPU(s):")
    for i, gpu in enumerate(gpus):
        print(f"   GPU {i}: {gpu}")
else:
    print("[ERROR] No GPUs detected by TensorFlow")
    print("\nPossible reasons:")
    print("   1. No NVIDIA GPU available")
    print("   2. CUDA/cuDNN not installed or incompatible version")
    print("   3. TensorFlow not built with GPU support")

# Check CUDA availability
print("\nCUDA Support:")
cuda_available = tf.test.is_built_with_cuda()
print(f"   Built with CUDA: {cuda_available}")

if cuda_available:
    cuda_version = tf.sysconfig.get_build_info().get('cuda_version', 'Unknown')
    cudnn_version = tf.sysconfig.get_build_info().get('cudnn_version', 'Unknown')
    print(f"   CUDA Version: {cuda_version}")
    print(f"   cuDNN Version: {cudnn_version}")

# Test GPU computation
print("\nGPU Computation Test:")
try:
    with tf.device('/GPU:0'):
        a = tf.constant([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
        b = tf.constant([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
        c = tf.matmul(a, b)
        print(f"[OK] GPU computation successful!")
        print(f"   Result shape: {c.shape}")
        print(f"   Device used: {c.device}")
except RuntimeError as e:
    print(f"[ERROR] GPU computation failed: {e}")

# List all available devices
print("\nAll Available Devices:")
devices = tf.config.list_physical_devices()
for device in devices:
    print(f"   {device.device_type}: {device.name}")

print("\n" + "=" * 60)
print("Recommendations:")
print("=" * 60)

if not gpus:
    print("To enable GPU support:")
    print("1. Verify you have an NVIDIA GPU (AMD/Intel GPUs not supported)")
    print("2. Install NVIDIA drivers")
    print("3. Install CUDA Toolkit (compatible with TensorFlow 2.20)")
    print("4. Install cuDNN library")
    print("5. Ensure PATH includes CUDA bin directory")
    print("\nFor TensorFlow 2.20, you typically need:")
    print("   - CUDA 12.x")
    print("   - cuDNN 8.x")
else:
    print("[OK] GPU detected! Your setup looks good.")
    print("If the bot still uses CPU, there may be a code issue.")

print("=" * 60)
