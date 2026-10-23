package com.pika7766.taiwansmartlife;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        FirebaseApp.initializeApp(this);
        super.onCreate(savedInstanceState);
    }
}
