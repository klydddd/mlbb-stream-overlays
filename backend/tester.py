import tensorflow as tf
import numpy as np
import os

# --- CONFIGURATION ---
MODEL_PATH = "mlbb_hero_model_pro"  # Point to the folder
LABELS_PATH = "labels.txt"
IMG_SIZE = (224, 224)


def load_labels():
    if not os.path.exists(LABELS_PATH):
        print(f"❌ Error: {LABELS_PATH} not found.")
        return []
    with open(LABELS_PATH, "r") as f:
        return [line.strip() for line in f.readlines()]


def predict_loop(model, class_names, mode="keras"):
    print(f"\n✅ Model loaded in [{mode.upper()}] mode.")
    print("Ready to test!")

    while True:
        print("\n" + "=" * 40)
        img_path = input("Drag and drop an image here (or 'q' to quit): ").strip()
        img_path = img_path.replace('"', '').replace("'", "")  # Clean quotes

        if img_path.lower() == 'q':
            break

        if not os.path.exists(img_path):
            print("❌ Error: File not found.")
            continue

        try:
            # 1. Preprocess Image
            img = tf.keras.utils.load_img(img_path, target_size=IMG_SIZE)
            img_array = tf.keras.utils.img_to_array(img)
            img_array = np.expand_dims(img_array, axis=0)  # Shape: (1, 224, 224, 3)

            # 2. Predict based on Mode
            if mode == "keras":
                # Standard Keras way
                predictions = model.predict(img_array, verbose=0)
                score_array = predictions[0]

            elif mode == "saved_model":
                # Low-Level TensorFlow way (The Fix for your error)
                # Note: SavedModels expect float inputs, usually 0-255 or 0-1 depending on training
                # Since we didn't rescale in the main loop, we pass raw pixels
                infer = model.signatures["serving_default"]

                # Convert to tensor constant
                input_tensor = tf.constant(img_array, dtype=tf.float32)

                # Run inference
                output = infer(input_tensor)

                # Extract the result (usually key is 'dense' or 'dense_1', we grab the first one)
                output_key = list(output.keys())[0]
                predictions = output[output_key].numpy()
                score_array = predictions[0]

            # 3. Interpret Results
            predicted_class_index = np.argmax(score_array)
            predicted_class_name = class_names[predicted_class_index]
            confidence = 100 * np.max(score_array)

            if confidence < 75:
                print(f"⚠️ RESULT: {predicted_class_name} (Low Confidence: {confidence:.2f}%)")
            else:
                print(f"✅ RESULT: {predicted_class_name}")
                print(f"📊 Confidence: {confidence:.2f}%")

        except Exception as e:
            print(f"❌ Error processing image: {e}")
            print("Debug hint: If using SavedModel, check input tensor shapes.")


if __name__ == "__main__":
    print(f"Loading model from '{MODEL_PATH}'...")

    class_names = load_labels()
    if not class_names:
        exit()

    # --- THE DUAL LOADER ---
    try:
        # 1. Try Standard Keras Loading
        model = tf.keras.models.load_model(MODEL_PATH)
        predict_loop(model, class_names, mode="keras")

    except Exception as e_keras:
        print(f"⚠️ Keras load failed: {e_keras}")
        print("🔄 Attempting to load as Low-Level SavedModel...")

        try:
            # 2. Try Low-Level Loading (The Robust Way)
            model = tf.saved_model.load(MODEL_PATH)
            predict_loop(model, class_names, mode="saved_model")

        except Exception as e_saved:
            print("\n❌ CRITICAL FAILURE: Could not load model in any format.")
            print(f"Error: {e_saved}")