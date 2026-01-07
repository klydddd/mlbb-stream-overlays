# GPU Setup Guide for TensorFlow 2.20

## Current Status
Your TensorFlow installation does NOT have GPU support enabled.
Built with CUDA: False

## Solution Options

### Option 1: Install CUDA + cuDNN (Recommended for best performance)

1. **Check if you have an NVIDIA GPU:**
   - Open Device Manager (Win + X -> Device Manager)
   - Look under "Display adapters"
   - If you see an NVIDIA GPU, continue. If not, GPU acceleration is not possible.

2. **Download and Install CUDA Toolkit 12.3:**
   - Visit: https://developer.nvidia.com/cuda-downloads
   - Download CUDA Toolkit 12.3 for Windows
   - Run the installer and follow the instructions
   - Default installation path: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3

3. **Download and Install cuDNN 8.9:**
   - Visit: https://developer.nvidia.com/cudnn
   - You'll need to create an NVIDIA Developer account (free)
   - Download cuDNN 8.9 for CUDA 12.x
   - Extract the zip file
   - Copy the files to your CUDA installation:
     - Copy cudnn*/bin/*.dll to C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3\bin
     - Copy cudnn*/include/*.h to C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3\include
     - Copy cudnn*/lib/*.lib to C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3\lib\x64

4. **Add CUDA to PATH:**
   - Open Environment Variables
   - Add to System PATH:
     - C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3\bin
     - C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3\libnvvp

5. **Restart your computer**

6. **Verify GPU support:**
   ```
   py gpu_check.py
   ```

### Option 2: Use DirectML (Windows GPU acceleration - works with AMD/Intel/NVIDIA)

If CUDA setup is too complex, you can use DirectML which works with any GPU on Windows:

1. **Install tensorflow-directml:**
   ```
   pip uninstall tensorflow
   pip install tensorflow-directml
   ```

2. **Note:** DirectML is typically slower than CUDA but easier to set up

### Option 3: Continue with CPU (Current setup)

If you don't have an NVIDIA GPU or don't want to install CUDA:
- The bot will work but will be slower
- For 16 regions, expect ~2-5 seconds per scan cycle
- With GPU, it would be ~0.1-0.5 seconds per cycle

## After Installing CUDA/cuDNN

Run this command to verify:
```
py gpu_check.py
```

You should see:
- Built with CUDA: True
- GPU devices detected
- Device used: /GPU:0

## Troubleshooting

If GPU still not detected after installing CUDA/cuDNN:
1. Make sure CUDA 12.3 is installed (not 11.x or 13.x)
2. Verify cuDNN 8.9 files were copied correctly
3. Check that CUDA bin directory is in PATH
4. Restart your computer
5. Try reinstalling TensorFlow: `pip uninstall tensorflow && pip install tensorflow`
